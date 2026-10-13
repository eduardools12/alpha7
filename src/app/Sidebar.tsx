import { Link, NavLink } from 'react-router-dom';
import { Logo } from '@/components/brand/Logo';
import { Icon } from '@/components/ui/Icon';
import { useSessionInfo } from '@/auth/TeamGate';
import { ROLE_LABEL } from '@/auth/permissions';
import { useWorkspace } from '@/data/WorkspaceProvider';
import { APP_VERSION } from '@/version';
import { NAV_ITEMS, PATHS } from './routes';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const session = useSessionInfo();
  const { backend } = useWorkspace();
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
      {session && (
        <div className={styles.account}>
          <p className={styles.accountTeam}>{session.team.name}</p>
          <p className={styles.accountMeta}>
            {session.email} · {ROLE_LABEL[session.team.role]}
          </p>
          {session.canSwitchTeam && (
            <button type="button" className={styles.accountOut} onClick={session.switchTeam}>
              Trocar de equipe
            </button>
          )}
          <button type="button" className={styles.accountOut} onClick={() => void session.signOut()}>
            Sair
          </button>
        </div>
      )}
      <p className={styles.foot}>Versão {APP_VERSION} · {backend === 'remote' ? 'dados na nuvem' : 'dados salvos neste navegador'}</p>
    </aside>
  );
}
