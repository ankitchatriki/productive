import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import styles from './Nav.module.css';
import { Icon, type IconName } from './Icon';
import { Modal } from './Modal';

export interface NavItem { to: string; label: string; icon: IconName; key: string }

// Order matches the 1–6 shortcuts in PLAN.md §5.
export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Today', icon: 'sun', key: '1' },
  { to: '/plan', label: 'Plan week', icon: 'calendar', key: '2' },
  { to: '/timecard', label: 'Timecard', icon: 'table', key: '3' },
  { to: '/courses', label: 'Courses', icon: 'book', key: '4' },
  { to: '/review', label: 'Review', icon: 'chart', key: '5' },
  { to: '/settings', label: 'Settings', icon: 'settings', key: '6' },
];

export function pageTitleFor(pathname: string): string {
  if (pathname === '/' || pathname === '') return 'Today';
  const item = NAV_ITEMS.find((n) => n.to !== '/' && pathname.startsWith(n.to));
  return item ? item.label : 'Productive';
}

function isActive(item: NavItem, pathname: string) {
  return item.to === '/' ? pathname === '/' : pathname.startsWith(item.to);
}

interface NavProps {
  /** Running timer pill (desktop sidebar + phone bar). Null when hidden. */
  pill: ReactNode;
  /** Shown in place of the pill when no timer is running. */
  idleSlot?: ReactNode;
  onShowShortcuts: () => void;
}

export function Nav({ pill, idleSlot, onShowShortcuts }: NavProps) {
  const { pathname } = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const main = NAV_ITEMS.slice(0, 5);
  const settings = NAV_ITEMS[5];
  const phoneTabs = [NAV_ITEMS[0], NAV_ITEMS[1], NAV_ITEMS[2], NAV_ITEMS[4]];
  const moreActive = isActive(NAV_ITEMS[3], pathname) || isActive(settings, pathname);

  const link = (item: NavItem) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.to === '/'}
      className={() => `${styles.item} ${isActive(item, pathname) ? styles.active : ''}`}
      data-label={item.label}
      aria-label={item.label}
    >
      <Icon name={item.icon} size={18} />
      <span className={styles.label}>{item.label}</span>
      <kbd className={styles.kbdHint} aria-hidden="true">{item.key}</kbd>
    </NavLink>
  );

  return (
    <>
      <nav className={styles.sidebar} aria-label="Main" data-nav>
        <NavLink to="/" className={styles.brand} aria-label="Productive, go to Today">
          <span className={styles.mark}><Icon name="clock" size={14} /></span>
          <span className={styles.label}>Productive</span>
        </NavLink>
        {main.map(link)}
        <div className={styles.flex} />
        <div className={styles.pillSlot}>{pill ?? idleSlot}</div>
        {link(settings)}
        <button type="button" className={styles.item} onClick={onShowShortcuts} data-label="Shortcuts" aria-label="Keyboard shortcuts" style={{ border: 0, background: 'none' }}>
          <Icon name="keyboard" size={18} />
          <span className={styles.label}>Shortcuts</span>
          <kbd className={styles.kbdHint} aria-hidden="true">?</kbd>
        </button>
      </nav>

      <header className={styles.topbar} data-nav>
        <span className={styles.mark} aria-hidden="true"><Icon name="clock" size={14} /></span>
        <h1>{pageTitleFor(pathname)}</h1>
      </header>

      {pill && <div className={styles.phonePill} data-nav>{pill}</div>}

      <nav className={styles.tabbar} aria-label="Main" data-nav>
        {phoneTabs.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.to === '/'} className={() => `${styles.tab} ${isActive(item, pathname) ? styles.active : ''}`}>
            <Icon name={item.icon} size={20} />
            <span>{item.label === 'Plan week' ? 'Plan' : item.label}</span>
          </NavLink>
        ))}
        <button type="button" className={`${styles.tab} ${moreActive ? styles.active : ''}`} onClick={() => setMoreOpen(true)} aria-haspopup="dialog">
          <Icon name="menu" size={20} />
          <span>More</span>
        </button>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <div className={styles.sheetList}>
          <NavLink to="/courses" onClick={() => setMoreOpen(false)}><Icon name="book" size={20} /> Courses</NavLink>
          <NavLink to="/settings" onClick={() => setMoreOpen(false)}><Icon name="settings" size={20} /> Settings</NavLink>
          <button type="button" onClick={() => { setMoreOpen(false); onShowShortcuts(); }}><Icon name="keyboard" size={20} /> Shortcuts</button>
        </div>
      </Modal>
    </>
  );
}
