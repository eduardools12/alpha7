import { PLAYER_STATUS_LABEL, type PlayerStatus } from '@/domain/player';
import styles from './Badge.module.css';

export function StatusBadge({ status }: { status: PlayerStatus }) {
  return <span className={`${styles.badge} ${styles[status]}`}>{PLAYER_STATUS_LABEL[status]}</span>;
}

/** Marca registros de demonstração para que nunca sejam confundidos com dados reais. */
export function DemoTag({ title = 'Dados de demonstração' }: { title?: string }) {
  return (
    <span className={`${styles.badge} ${styles.demo}`} title={title}>
      Demo
    </span>
  );
}
