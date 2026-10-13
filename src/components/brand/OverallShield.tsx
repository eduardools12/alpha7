import { useId } from 'react';
import styles from './OverallShield.module.css';

interface OverallShieldProps {
  /** null = sem avaliação: mostra "—" e nunca 0. */
  overall: number | null;
  size?: 'sm' | 'lg';
  /** Mostra a palavra "Overall" acima do número (perfil). */
  showLabel?: boolean;
}

export function OverallShield({ overall, size = 'sm', showLabel = false }: OverallShieldProps) {
  const gradientId = useId();
  return (
    <div
      className={`${styles.shield} ${styles[size]}`}
      role="img"
      aria-label={overall === null ? 'Overall indisponível: sem avaliação' : `Overall ${overall}`}
    >
      <svg viewBox="0 0 64 76" aria-hidden="true">
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4c2088" />
            <stop offset="1" stopColor="#1d0638" />
          </linearGradient>
        </defs>
        <path
          d="M32 3 59 13v23c0 17-11 28-27 36C16 64 5 53 5 36V13Z"
          fill={`url(#${gradientId})`}
          stroke="#b9a6d0"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
      <span className={styles.content}>
        {showLabel && <span className={styles.label}>Overall</span>}
        <span className={styles.number}>{overall ?? '—'}</span>
      </span>
    </div>
  );
}
