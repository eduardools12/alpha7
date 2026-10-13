import { formatPercent } from '@/domain/metrics';
import type { DistributionItem } from './fundamentalView';
import styles from './DistributionBars.module.css';

/**
 * Distribuição por categoria. A barra é só apoio visual: a contagem e o percentual com
 * denominador estão sempre em texto ao lado. Sem tentativas, as barras ficam vazias e o
 * percentual aparece como "—" (nunca 0%).
 */
export function DistributionBars({ items, label }: { items: DistributionItem[]; label: string }) {
  return (
    <ul className={styles.list} aria-label={label}>
      {items.map((item) => (
        <li key={item.key} className={styles.row}>
          <span className={styles.name}>{item.label}</span>
          <span className={styles.track} aria-hidden="true">
            <span
              className={styles.fill}
              data-tone={item.tone}
              style={{ width: `${(item.share.value ?? 0) * 100}%` }}
            />
          </span>
          <span className={`${styles.value} tabular`}>
            <b>{item.count}</b> <small>{formatPercent(item.share, 0)}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}
