import { useState } from 'react';
import { HashRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import styles from './App.module.css';
import { Nav } from './components/Nav';
import { useStorageInfo } from './state/store';

function Placeholder({ title }: { title: string }) {
  return (
    <div className="page">
      <div className="page-header"><h1 className="page-title">{title}</h1></div>
      <p className="muted">Coming soon.</p>
    </div>
  );
}

function Layout() {
  const [, setShortcuts] = useState(false);
  const { storageError } = useStorageInfo();
  return (
    <div className={styles.shell}>
      <Nav pill={null} onShowShortcuts={() => setShortcuts(true)} />
      <main className={styles.main} id="main">
        {storageError && <div className="banner banner-danger" role="alert" style={{ margin: 16 }}>{storageError}</div>}
        <Outlet />
      </main>
    </div>
  );
}

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/welcome" element={<Placeholder title="Welcome" />} />
        <Route element={<Layout />}>
          <Route index element={<Placeholder title="Today" />} />
          <Route path="plan/:weekStart?" element={<Placeholder title="Plan week" />} />
          <Route path="timecard/:weekStart?" element={<Placeholder title="Timecard" />} />
          <Route path="courses" element={<Placeholder title="Courses" />} />
          <Route path="courses/:courseId" element={<Placeholder title="Course" />} />
          <Route path="review/:weekStart?" element={<Placeholder title="Review" />} />
          <Route path="settings" element={<Placeholder title="Settings" />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
