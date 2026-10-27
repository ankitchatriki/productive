import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './WelcomePage.module.css';
import { useDispatch, useStore } from '../state/store';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { parseBulkSections, sectionsOfCourse } from '../domain/sections';
import { onboardingActions, onboardingGoalActions } from '../state/onboarding';
import { nextCourseColor } from '../domain/colors';
import { newId } from '../domain/ids';
import { WEEKDAY_SHORT, formatDay, toDateKey, weekDates, weekStartOf } from '../domain/time';
import type { Id, Weekday } from '../domain/types';
import { DurationInput } from '../components/DurationInput';
import { ColorSwatches } from '../components/CourseDialog';
import { Icon } from '../components/Icon';
import { CorruptBanner } from '../components/CorruptBanner';
import { BrandMark, Wordmark } from '../components/Brand';

export function WelcomePage() {
  useDocumentTitle('Welcome');
  const data = useStore();
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState(data.settings.dailyGoalMinutes);
  const [rest, setRest] = useState<Weekday[]>(data.settings.restDays);
  const [name, setName] = useState('');
  const [color, setColor] = useState(() => nextCourseColor(data.courses));
  const [bulk, setBulk] = useState('');
  const [nameError, setNameError] = useState('');
  const [courseId, setCourseId] = useState<Id | null>(null);

  const today = toDateKey(new Date());
  const ws = weekStartOf(today);
  const plan = data.weekPlans[ws];

  const finish = () => {
    dispatch({ type: 'settings/update', patch: { onboarded: true } });
    navigate('/');
  };
  const step1 = () => {
    for (const a of onboardingGoalActions(data, { dailyGoalMinutes: goal, restDays: rest }, today, new Date().toISOString())) dispatch(a);
    setStep(2);
  };
  const step2 = () => {
    if (!name.trim()) { setNameError('Enter a course name.'); return; }
    const r = onboardingActions(data, { dailyGoalMinutes: goal, restDays: rest, courseName: name, color, sectionsText: bulk }, courseId, today, new Date().toISOString(), newId);
    for (const a of r.actions) dispatch(a);
    setCourseId(r.courseId);
    setStep(3);
  };

  const courseSections = courseId ? sectionsOfCourse(data.sections, courseId) : [];

  return (
    <div className={styles.screen}>
      <main className={styles.inner}>
        <CorruptBanner />
        <div className={styles.brand}><BrandMark size={24} /> <Wordmark /></div>
        <div className={styles.dots} aria-label={`Step ${step} of 3`}>
          {[1, 2, 3].map((n) => <span key={n} className={n <= step ? styles.on : ''} />)}
        </div>
        <h1 className={styles.title}>Set up your timecard</h1>

        <section className={`card ${styles.step} ${step > 1 ? styles.done : ''}`} aria-labelledby="w1">
          <div className={styles.stepHead}>
            <h2 id="w1" className="card-title">1. Your goal</h2>
            {step > 1 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>Edit</button>}
          </div>
          {step === 1 && (
            <>
              <div className="field">
                <label htmlFor="w-goal">Daily goal (hours)</label>
                <DurationInput id="w-goal" value={goal} step={30} min={15} max={24 * 60} ariaLabel="daily goal" onCommit={(m) => m && setGoal(m)} />
              </div>
              <div className="field">
                <span className="label" id="w-rest">Rest days</span>
                <div className="daychips" role="group" aria-labelledby="w-rest">
                  {WEEKDAY_SHORT.map((w, i) => (
                    <button key={w} type="button" className="daychip" aria-pressed={rest.includes(i as Weekday)}
                      onClick={() => setRest((r) => (r.includes(i as Weekday) ? r.filter((x) => x !== i) : r.length < 6 ? [...r, i as Weekday].sort() : r))}>{w}</button>
                  ))}
                </div>
                <span className="help">Pressed = rest day. Leave all unpressed to study every day.</span>
              </div>
              <div className={styles.footer}>
                <button type="button" className="btn btn-ghost" onClick={finish}>Skip</button>
                <button type="button" className="btn btn-primary" onClick={step1}>Next <Icon name="right" /></button>
              </div>
            </>
          )}
        </section>

        {step >= 2 && (
          <section className={`card ${styles.step} ${step > 2 ? styles.done : ''}`} aria-labelledby="w2">
            <h2 id="w2" className="card-title">2. Your material</h2>
            {step === 2 ? (
              <>
                <div className="field">
                  <label htmlFor="w-course">Course name</label>
                  <input id="w-course" className="input" value={name} onChange={(e) => { setName(e.target.value); setNameError(''); }} placeholder="Organic Chemistry" aria-invalid={!!nameError || undefined} autoFocus />
                  {nameError && <span className="error">{nameError}</span>}
                </div>
                <div className="field">
                  <span className="label">Colour</span>
                  <ColorSwatches value={color} onChange={setColor} name="w-colour" />
                </div>
                <div className="field">
                  <label htmlFor="w-sections">Sections, one per line (optional <span className="num">| hours</span>)</label>
                  <textarea id="w-sections" className="textarea" rows={6} value={bulk} onChange={(e) => setBulk(e.target.value)} placeholder={'Ch 1 – Structure & bonding | 4\nCh 2 – Alkanes | 5\nCh 3 – Stereochemistry | 6'} />
                  <span className="help">{parseBulkSections(bulk).length} sections. You can add more courses later.</span>
                </div>
                <div className={styles.footer}>
                  <button type="button" className="btn btn-ghost" onClick={finish}>Skip</button>
                  <button type="button" className="btn btn-primary" onClick={step2}>Next <Icon name="right" /></button>
                </div>
              </>
            ) : <p className="muted">{data.courses.find((c) => c.id === courseId)?.name} · {courseSections.length} sections</p>}
          </section>
        )}

        {step === 3 && (
          <section className={`card ${styles.step}`} aria-labelledby="w3">
            <h2 id="w3" className="card-title">3. This week</h2>
            <p className="muted">One section per day, starting today. Change any day below.</p>
            <ol className={styles.dayList}>
              {weekDates(ws).map((d) => {
                const past = d < today;
                return (
                  <li key={d} className={styles.dayRow}>
                    <label htmlFor={`w-day-${d}`} className={past ? styles.past : undefined}>{formatDay(d)}</label>
                    <select id={`w-day-${d}`} className="select" disabled={past} value={plan?.sectionByDay[d] ?? ''}
                      onChange={(e) => dispatch({ type: 'plan/assignSection', weekStart: ws, date: d, sectionId: e.target.value || null })}>
                      <option value="">{past ? '—' : 'No section'}</option>
                      {courseSections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                    </select>
                  </li>
                );
              })}
            </ol>
            <div className={styles.footer}>
              <button type="button" className="btn btn-ghost" onClick={finish}>Skip</button>
              <button type="button" className="btn btn-primary btn-lg" onClick={finish}><Icon name="play" /> Start studying</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
