import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';
import styles from './Notice.module.css';

type Tone = 'info' | 'success' | 'warning' | 'error';

const ICON: Record<Tone, IconName> = { info: 'info', success: 'check', warning: 'alert', error: 'alert' };

interface NoticeProps {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Faixa de uma linha (avisos do sistema que acompanham toda tela): título e texto lado a lado. */
  compact?: boolean;
}

/** Erros e avisos importantes usam role="alert"; informativos usam role="status". */
export function Notice({ tone = 'info', title, children, action, compact = false }: NoticeProps) {
  return (
    <div className={`${styles.notice} ${styles[tone]} ${compact ? styles.compact : ''}`} role={tone === 'error' || tone === 'warning' ? 'alert' : 'status'}>
      <Icon name={ICON[tone]} size={20} className={styles.icon} />
      <div className={styles.body}>
        {title && <strong className={styles.title}>{title}</strong>}
        {children && <div className={styles.text}>{children}</div>}
      </div>
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
