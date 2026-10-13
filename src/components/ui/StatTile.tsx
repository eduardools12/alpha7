import type { ReactNode } from 'react';
import { DemoTag } from './Badge';
import { Icon, type IconName } from './Icon';
import styles from './StatTile.module.css';

interface StatTileProps {
  label: string;
  value: string;
  detail: string;
  icon?: IconName;
  demo?: boolean;
  /** Mini gráfico ou indicador de evolução; só entra quando agrega informação real. */
  visual?: ReactNode;
  tone?: 'purple' | 'plain';
  /** Linha extra abaixo do detalhe (selo de amostra, fórmula). */
  footer?: ReactNode;
}

/** Indicador do dashboard e das estatísticas: rótulo com ícone, valor grande (Barlow Condensed), detalhe com denominador. */
export function StatTile({ label, value, detail, icon, demo = false, visual, tone = 'purple', footer }: StatTileProps) {
  return (
    <div className={`${styles.tile} ${tone === 'plain' ? styles.plain : ''}`}>
      <p className={styles.label}>
        {icon && <Icon name={icon} size={16} className={styles.icon} />}
        {label} {demo && <DemoTag />}
      </p>
      <div className={styles.valueRow}>
        <p className={`${styles.value} tabular`}>{value}</p>
        {visual && <span className={styles.visual}>{visual}</span>}
      </div>
      <p className={styles.detail}>{detail}</p>
      {footer}
    </div>
  );
}

interface SparklineProps {
  values: readonly number[];
  /** Descrição lida por leitores de tela (os números reais ficam no gráfico completo e na tabela). */
  label: string;
}

/** Mini linha de tendência (só com 2 ou mais pontos reais). Sem eixos: o valor exato está no indicador ao lado. */
export function Sparkline({ values, label }: SparklineProps) {
  if (values.length < 2) return null;
  const width = 88;
  const height = 30;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((v, i) => `${(i / (values.length - 1)) * (width - 6) + 3},${height - 4 - ((v - min) / span) * (height - 8)}`);
  const last = points[points.length - 1]?.split(',') ?? ['0', '0'];
  return (
    <svg className={styles.spark} viewBox={`0 0 ${width} ${height}`} width={width} height={height} role="img" aria-label={label}>
      <polyline points={points.join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={last[0]} cy={last[1]} r="3" fill="currentColor" />
    </svg>
  );
}

interface ResultDotsProps {
  /** Do mais antigo para o mais recente. */
  results: readonly ('vitoria' | 'derrota' | 'empate')[];
}

const DOT_LABEL = { vitoria: 'vitória', derrota: 'derrota', empate: 'empate' } as const;

/** Últimos resultados em pontinhos (verde = vitória, vermelho = derrota). A informação também vai em texto para quem não vê cor. */
export function ResultDots({ results }: ResultDotsProps) {
  if (results.length === 0) return null;
  return (
    <span className={styles.dots} role="img" aria-label={`Últimos resultados, do mais antigo ao mais recente: ${results.map((r) => DOT_LABEL[r]).join(', ')}`}>
      {results.map((r, i) => (
        <i key={i} className={`${styles.dot} ${styles[r]}`}>
          {r === 'vitoria' ? 'V' : r === 'derrota' ? 'D' : 'E'}
        </i>
      ))}
    </span>
  );
}
