import { Link, NavLink } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { Icon } from '@/components/ui/Icon';
import { APP_VERSION } from '@/version';
import { NAV_ITEMS, PATHS } from './routes';
import styles from './Sidebar.module.css';

export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <Link to={PATHS.dashboard} className={styles.brand} aria-label="Alpha7 Volleyball Performance, ir ao dashboard">
        <Logo height={38} />
      </Link>
      <nav aria-label="Principal">
        <ul className={styles.list}>
          {NAV_ITEMS.map((item) => (
            <li key={item.to}>
              <NavLink to={item.to} end={item.end ?? false} className={({ isActive }) => `${styles.link} ${isActive ? styles.active : ''}`}>
                <Icon name={item.icon} />
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <p className={styles.foot}>Versão {APP_VERSION} · dados salvos neste navegador</p>
    </aside>
  );
}
