import styles from './Logo.module.css';

interface LogoProps {
  variant?: 'lockup' | 'mark';
  /** white para fundos escuros; purple para fundos claros. */
  tone?: 'white' | 'lilac' | 'purple';
  height?: number;
}

/**
 * Símbolo A7 oficial. Os PNGs em /public/brand são derivados do arquivo original
 * (design/assets/a7 logo.jpeg) apenas com fundo transparente; o desenho não é refeito.
 */
export function Logo({ variant = 'lockup', tone = 'white', height = 40 }: LogoProps) {
  const mark = (
    <img
      src={`/brand/a7-mark-${tone}.png`}
      alt={variant === 'mark' ? 'Alpha7' : ''}
      height={height}
      width={Math.round(height * (640 / 457))}
      className={styles.mark}
    />
  );
  if (variant === 'mark') return mark;
  return (
    <span className={styles.lockup}>
      {mark}
      <span className={styles.words}>
        <span className={styles.name}>Alpha7</span>
        <span className={styles.tag}>Volleyball Performance</span>
      </span>
    </span>
  );
}
