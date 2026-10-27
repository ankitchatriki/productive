import { useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import styles from './WeekGrid.module.css';
import type { Course, DateKey, Id, ScheduledBlock, Section } from '../domain/types';
import { colorVar } from '../domain/colors';
import { WEEKDAY_SHORT, formatDuration, minToHHMM, parseDateKey, weekdayOf } from '../domain/time';
import { floor15, plannedMinutes, snap15 } from '../domain/plan';

const HOUR_PX = 48;
const MIN_PX = HOUR_PX / 60;
const CLICK_SLOP = 4;

export interface WeekGridProps {
  dates: DateKey[];
  blocks: ScheduledBlock[];
  sectionByDay: Record<DateKey, Id | null>;
  restDays: number[];
  startHour: number;
  endHour: number;
  today: DateKey;
  nowMin: number;
  courses: Map<Id, Course>;
  sections: Map<Id, Section>;
  /** Pointer drag/resize/create (desktop). Touch never drags. */
  dragEnabled: boolean;
  onCreate: (date: DateKey, startMin: number, endMin: number) => void;
  /** Return false when the drop is rejected (overlap) so the block snaps back. */
  onMove: (block: ScheduledBlock, next: { date: DateKey; startMin: number; endMin: number }) => boolean;
  onOpen: (block: ScheduledBlock) => void;
  onDelete: (block: ScheduledBlock) => void;
}

type Drag =
  | { kind: 'create'; date: DateKey; anchor: number; current: number; x: number; y: number; moved: boolean }
  | { kind: 'move' | 'resize'; block: ScheduledBlock; x: number; y: number; date: DateKey; startMin: number; endMin: number; moved: boolean };

function hourLabel(h: number) {
  const d = new Date(2020, 0, 1, h % 24);
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).format(d);
}

export function WeekGrid(props: WeekGridProps) {
  const { dates, blocks, sectionByDay, restDays, startHour, endHour, today, nowMin, courses, sections, dragEnabled } = props;
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const colRefs = useRef<Map<DateKey, HTMLDivElement>>(new Map());
  const gridStart = startHour * 60;
  const gridEnd = endHour * 60;
  const heightPx = (gridEnd - gridStart) * MIN_PX;

  const setD = (d: Drag | null) => { dragRef.current = d; setDrag(d); };

  const minAt = (date: DateKey, clientY: number) => {
    const el = colRefs.current.get(date);
    if (!el) return gridStart;
    const y = clientY - el.getBoundingClientRect().top;
    return Math.min(gridEnd, Math.max(gridStart, gridStart + y / MIN_PX));
  };
  const dateAtX = (clientX: number, fallback: DateKey) => {
    for (const [d, el] of colRefs.current) {
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX < r.right) return d;
    }
    return fallback;
  };

  const startWindowDrag = () => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const moved = d.moved || Math.abs(e.clientX - d.x) > CLICK_SLOP || Math.abs(e.clientY - d.y) > CLICK_SLOP;
      if (d.kind === 'create') {
        setD({ ...d, current: minAt(d.date, e.clientY), moved });
      } else if (d.kind === 'move') {
        const delta = snap15((e.clientY - d.y) / MIN_PX);
        const len = d.block.endMin - d.block.startMin;
        const start = Math.min(Math.max(gridStart, d.block.startMin + delta), gridEnd - len);
        setD({ ...d, date: dateAtX(e.clientX, d.date), startMin: start, endMin: start + len, moved });
      } else {
        const delta = snap15((e.clientY - d.y) / MIN_PX);
        const endMin = Math.min(gridEnd, Math.max(d.block.startMin + 15, d.block.endMin + delta));
        setD({ ...d, endMin, moved });
      }
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      const d = dragRef.current;
      setD(null);
      if (!d) return;
      if (d.kind === 'create') {
        if (!d.moved) {
          const s = floor15(d.anchor);
          props.onCreate(d.date, s, Math.min(gridEnd, s + 60));
        } else {
          let s = floor15(Math.min(d.anchor, d.current));
          let e = Math.ceil(Math.max(d.anchor, d.current) / 15) * 15;
          if (e - s < 15) e = s + 15;
          if (e > gridEnd) { e = gridEnd; s = Math.min(s, e - 15); }
          props.onCreate(d.date, s, e);
        }
      } else if (!d.moved) {
        props.onOpen(d.block);
      } else if (d.date !== d.block.date || d.startMin !== d.block.startMin || d.endMin !== d.block.endMin) {
        props.onMove(d.block, { date: d.date, startMin: d.startMin, endMin: d.endMin });
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const onColumnPointerDown = (date: DateKey) => (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragEnabled || e.button !== 0 || e.pointerType === 'touch') return;
    if (e.target !== e.currentTarget && !(e.target as HTMLElement).dataset.slot) return;
    e.preventDefault();
    const m = minAt(date, e.clientY);
    setD({ kind: 'create', date, anchor: m, current: m, x: e.clientX, y: e.clientY, moved: false });
    startWindowDrag();
  };

  const onBlockPointerDown = (block: ScheduledBlock, kind: 'move' | 'resize') => (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    if (!dragEnabled || e.pointerType === 'touch') return; // tap → click handler opens it
    e.preventDefault();
    setD({ kind, block, x: e.clientX, y: e.clientY, date: block.date, startMin: block.startMin, endMin: block.endMin, moved: false });
    startWindowDrag();
  };

  const onBlockKey = (block: ScheduledBlock) => (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); props.onOpen(block); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); props.onDelete(block); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const d = e.key === 'ArrowUp' ? -15 : 15;
      if (e.shiftKey) {
        const endMin = Math.max(block.startMin + 15, Math.min(1440, block.endMin + d));
        props.onMove(block, { date: block.date, startMin: block.startMin, endMin });
      } else {
        const startMin = block.startMin + d;
        const endMin = block.endMin + d;
        if (startMin >= 0 && endMin <= 1440) props.onMove(block, { date: block.date, startMin, endMin });
      }
    }
  };

  const hours: number[] = [];
  for (let h = startHour; h < endHour; h++) hours.push(h);

  const renderBlock = (b: ScheduledBlock, preview?: { date: DateKey; startMin: number; endMin: number }) => {
    const pos = preview ?? b;
    const course = courses.get(b.courseId);
    const section = b.sectionId ? sections.get(b.sectionId) : undefined;
    const top = (Math.max(pos.startMin, gridStart) - gridStart) * MIN_PX;
    const bottom = (Math.min(pos.endMin, gridEnd) - gridStart) * MIN_PX;
    if (bottom <= 0 || top >= heightPx) return null;
    const len = pos.endMin - pos.startMin;
    const title = [course?.name ?? 'Course', section?.title, b.label].filter(Boolean).join(' · ');
    const timeText = `${minToHHMM(pos.startMin)}–${minToHHMM(pos.endMin)}`;
    return (
      <div
        key={b.id}
        className={`${styles.block} ${len < 30 ? styles.short : ''} ${preview ? styles.dragging : ''}`}
        style={{ top, height: Math.max(6, bottom - top), ['--c' as string]: colorVar(course?.color) }}
        role="button"
        tabIndex={0}
        title={`${title}\n${timeText} (${formatDuration(len)})`}
        aria-label={`Planned ${title}, ${timeText}. Enter to edit, arrows to move, Delete to remove.`}
        onPointerDown={onBlockPointerDown(b, 'move')}
        onClick={(e) => { if (!dragEnabled || (e.nativeEvent as PointerEvent).pointerType === 'touch' || e.detail === 0) props.onOpen(b); }}
        onKeyDown={onBlockKey(b)}
      >
        {len >= 30 && (
          <>
            <span className={styles.blockTitle}>{course?.name}</span>
            {len >= 45 && <span className={styles.blockSub}>{section?.title ?? b.label}</span>}
            <span className={`${styles.blockDur} num`}>{formatDuration(len)}</span>
          </>
        )}
        {dragEnabled && <span className={styles.handle} onPointerDown={onBlockPointerDown(b, 'resize')} aria-hidden="true" />}
      </div>
    );
  };

  return (
    <div className={styles.grid} style={{ ['--cols' as string]: dates.length }}>
      <div className={styles.head}>
        <div className={styles.gutterHead} />
        {dates.map((d) => {
          const sid = sectionByDay[d];
          const sec = sid ? sections.get(sid) : undefined;
          const course = sec ? courses.get(sec.courseId) : undefined;
          const rest = restDays.includes(weekdayOf(d));
          return (
            <div key={d} className={`${styles.dayHead} ${d === today ? styles.todayHead : ''}`}>
              <span className={styles.wd}>{WEEKDAY_SHORT[weekdayOf(d)]}{rest ? ' · rest' : ''}</span>
              <span className={`${styles.dnum} num`}>{parseDateKey(d).getDate()}</span>
              <span className={`${styles.dayTotal} num`}>{formatDuration(plannedMinutes(blocks, d))}</span>
              <span className={styles.secChip} style={{ ['--c' as string]: colorVar(course?.color) }} title={sec?.title}>
                {sec ? <span className="truncate">{sec.title}</span> : <span className="subtle">No section</span>}
              </span>
            </div>
          );
        })}
      </div>
      <div className={styles.body} style={{ height: heightPx }}>
        <div className={styles.gutter}>
          {hours.map((h) => <span key={h} className={styles.hour} style={{ top: (h - startHour) * HOUR_PX }}>{hourLabel(h)}</span>)}
        </div>
        {dates.map((d) => {
          const rest = restDays.includes(weekdayOf(d));
          const dayBlocks = blocks.filter((b) => b.date === d && !(drag && drag.kind !== 'create' && drag.block.id === b.id));
          const dragged = drag && drag.kind !== 'create' && drag.date === d ? drag : null;
          const creating = drag && drag.kind === 'create' && drag.date === d && drag.moved ? drag : null;
          return (
            <div
              key={d}
              ref={(el) => { if (el) colRefs.current.set(d, el); else colRefs.current.delete(d); }}
              className={`${styles.col} ${d === today ? styles.todayCol : ''} ${rest ? styles.restCol : ''} ${dragEnabled ? styles.creatable : ''}`}
              onPointerDown={onColumnPointerDown(d)}
              aria-label={`${WEEKDAY_SHORT[weekdayOf(d)]} ${d}`}
            >
              {dayBlocks.map((b) => renderBlock(b))}
              {dragged && renderBlock(dragged.block, { date: dragged.date, startMin: dragged.startMin, endMin: dragged.endMin })}
              {creating && (
                <div className={`${styles.block} ${styles.ghost}`} style={{
                  top: (floor15(Math.min(creating.anchor, creating.current)) - gridStart) * MIN_PX,
                  height: Math.max(12, (Math.ceil(Math.max(creating.anchor, creating.current) / 15) * 15 - floor15(Math.min(creating.anchor, creating.current))) * MIN_PX),
                }} />
              )}
              {d === today && nowMin >= gridStart && nowMin <= gridEnd && (
                <div className={styles.now} style={{ top: (nowMin - gridStart) * MIN_PX }} aria-hidden="true" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
