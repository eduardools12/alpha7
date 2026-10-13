import { ATTRIBUTE_MAX, ATTRIBUTE_META, type AttributeKey } from '@/domain/attributes';
import styles from './AttributeBar.module.css';

interface AttributeBarProps {
  attribute: AttributeKey;
  value: number;
}

export function AttributeBar({ attribute, value }: AttributeBarProps) {
  const { label } = ATTRIBUTE_META[attribute];
  return (
    <div className={styles.row}>
      <span className={styles.label}>
        {label} <abbr title={label}>{attribute}</abbr>
      </span>
      <span className={`${styles.value} tabular`}>{value}</span>
      <div
        className={styles.track}
        role="meter"
        aria-label={label}
        aria-valuemin={1}
        aria-valuemax={ATTRIBUTE_MAX}
        aria-valuenow={value}
      >
        <div className={styles.fill} style={{ width: `${(value / ATTRIBUTE_MAX) * 100}%` }} />
      </div>
    </div>
  );
}
