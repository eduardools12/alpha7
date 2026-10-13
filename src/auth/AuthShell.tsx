import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import styles from './AuthShell.module.css';

/** Linhas de uma quadra de vôlei (18 x 9 m): rede, linhas de ataque a 3 m e contorno. Só decoração. */
function CourtLines() {
  return (
    <svg className={styles.court} viewBox="0 0 180 90" aria-hidden="true" focusable="false" preserveAspectRatio="xMidYMid slice">
      <g fill="none" stroke="currentColor" strokeWidth="0.6" vectorEffect="non-scaling-stroke">
        <rect x="6" y="6" width="168" height="78" />
        <line x1="90" y1="6" x2="90" y2="84" strokeWidth="1.2" />
        <line x1="60" y1="6" x2="60" y2="84" strokeDasharray="2 2" />
        <line x1="120" y1="6" x2="120" y2="84" strokeDasharray="2 2" />
      </g>
    </svg>
  );
}

/** Moldura das telas anteriores ao app (login, nova senha, equipe, erro de configuração). */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <aside className={styles.brand}>
        <CourtLines />
        <Logo height={52} />
        <p className={styles.statement}>Elenco, treinos e partidas da equipe em um só lugar.</p>
      </aside>
      <div className={styles.panel}>
        <section className={styles.column} aria-labelledby="auth-title">
          <h2 id="auth-title" className={styles.title}>
            {title}
          </h2>
          {children}
        </section>
      </div>
    </main>
  );
}
