import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { Icon } from '@/components/ui/Icon';
import { NAV_ITEMS, PATHS } from './routes';
import styles from './MobileNav.module.css';

const PRIMARY = NAV_ITEMS.filter((item) => !item.secondary);
const MORE = NAV_ITEMS.filter((item) => item.secondary);

export function MobileTopBar() {
  return (
    <div className={styles.topbar}>
      <Link to={PATHS.dashboard} aria-label="Alpha7 Volleyball Performance, ir ao dashboard">
        <Logo variant="mark" height={30} />
      </Link>
      <span className={styles.topTitle}>Alpha7 Performance</span>
    </div>
  );
}

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const toggleRef = useRef<HTMLButtonElement>(null);
  const moreActive = MORE.some((item) => location.pathname.startsWith(item.to));

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className={styles.wrap}>
      {open && (
        <div id="menu-mais" className={styles.sheet}>
          <ul>
            {MORE.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} className={({ isActive }) => `${styles.sheetLink} ${isActive ? styles.active : ''}`}>
                  <Icon name={item.icon} />
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      )}
      <nav className={styles.bar} aria-label="Principal, celular">
        <ul className={styles.items}>
          {PRIMARY.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end ?? false} className={({ isActive }) => `${styles.item} ${isActive ? styles.active : ''}`}>
                <Icon name={item.icon} size={22} />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
          <li>
            <button
              ref={toggleRef}
              type="button"
              className={`${styles.item} ${moreActive || open ? styles.active : ''}`}
              aria-expanded={open}
              aria-controls="menu-mais"
              onClick={() => setOpen((value) => !value)}
            >
              <Icon name="more" size={22} />
              <span>Mais</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
