import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  back?: { to: string; label: string };
  actions?: ReactNode;
  /** Cabeçalho menor em telas pequenas, para telas operacionais que precisam de espaço (registro rápido). */
  compact?: boolean;
}

export function PageHeader({ title, subtitle, back, actions, compact = false }: PageHeaderProps) {
  return (
    <header className={`${styles.header} ${compact ? styles.compact : ''}`}>
      <div className={styles.text}>
        {back && (
          <Link to={back.to} className={styles.back}>
            <Icon name="back" size={16} />
            {back.label}
          </Link>
        )}
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
