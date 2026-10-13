import type { ReactNode } from 'react';
import { Logo } from '@/components/brand/Logo';
import { Card } from '@/components/ui/Card';
import styles from './AuthShell.module.css';

/** Moldura das telas anteriores ao app (login, nova senha, equipe, erro de configuração). */
export function AuthShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className={styles.page}>
      <div className={styles.column}>
        <div className={styles.brand}>
          <Logo height={44} />
        </div>
        <Card title={title}>{children}</Card>
      </div>
    </main>
  );
}
