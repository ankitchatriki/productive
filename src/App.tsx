import { HashRouter, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import styles from './App.module.css';
import { Nav } from './components/Nav';
import { TimerIdle, TimerPill } from './components/TimerPill';
import { useStorageInfo, useStore } from './state/store';
import { AppUiProvider, useUi } from './state/ui';
import { CoursesPage } from './pages/CoursesPage';
import { CourseDetailPage } from './pages/CourseDetailPage';
import { TodayPage } from './pages/TodayPage';
import { PlanPage } from './pages/PlanPage';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">{title}</h1></div>
      <p className="muted">Coming soon.</p>
    </div>
  );
}

function Layout() {
  const { storageError } = useStorageInfo();
  const data = useStore();
  const ui = useUi();
  const { pathname } = useLocation();
  const onToday = pathname === '/';
  const showPill = !!data.activeTimer && !onToday;
  const target = ui.effectiveTarget;
  const targetLabel = target ? data.sections.find((s) => s.id === target.sectionId)?.title ?? data.courses.find((c) => c.id === target.courseId)?.name ?? null : null;
  return (
    <div className={styles.shell}>
      <Nav
        pill={showPill ? <TimerPill onStop={ui.toggleTimer} /> : null}
        idleSlot={data.activeTimer ? null : <TimerIdle label={targetLabel} onClockIn={ui.toggleTimer} />}
        onShowShortcuts={ui.openShortcuts}
      />
      <main className={`${styles.main} ${showPill ? styles.withPill : ''}`} id="main">
        {storageError && <div className="banner banner-danger" role="alert" style={{ margin: 16 }}>{storageError}</div>}
        <Outlet />
      </main>
    </div>
  );
}

function Shell() {
  return (
    <AppUiProvider>
      <Layout />
    </AppUiProvider>
  );
}

export function App() {
  return (
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/welcome" element={<Placeholder title="Welcome" />} />
        <Route element={<Shell />}>
          <Route index element={<TodayPage />} />
          <Route path="plan/:weekStart?" element={<PlanPage />} />
          <Route path="timecard/:weekStart?" element={<Placeholder title="Timecard" />} />
          <Route path="courses" element={<CoursesPage />} />
          <Route path="courses/:courseId" element={<CourseDetailPage />} />
          <Route path="review/:weekStart?" element={<Placeholder title="Review" />} />
          <Route path="settings" element={<Placeholder title="Settings" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
