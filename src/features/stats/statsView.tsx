import { formatPercent, formatRatioContext, type Ratio } from '@/domain/metrics';
import { MIN_SAMPLE, sampleLevel } from '@/domain/trainingStats';
import styles from './StatsPage.module.css';

/** Percentual para os gráficos (0 a 100, uma casa), ou null quando não há tentativas (lacuna, nunca zero). */
export const chartPct = (r: Ratio): number | null => (r.value === null ? null : Math.round(r.value * 1000) / 10);

/** "50,0% (2 de 4)" ou "Sem dados". */
export const pctWithContext = (r: Ratio): string => (r.attempts === 0 ? 'Sem dados' : `${formatPercent(r)} (${formatRatioContext(r)})`);

/** Sinaliza a amostra: sem tentativas, pequena (< MIN_SAMPLE) ou adequada. Sempre com o número de tentativas. */
export function SampleBadge({ attempts }: { attempts: number }) {
  const level = sampleLevel(attempts);
  if (level === 'none') return <span className={`${styles.sample} ${styles.none}`}>Sem dados</span>;
  if (level === 'small') {
    return (
      <span className={`${styles.sample} ${styles.small}`} title={`Menos de ${MIN_SAMPLE} tentativas: não dá para concluir nem comparar`}>
        Amostra pequena: {attempts} {attempts === 1 ? 'tentativa' : 'tentativas'}
      </span>
    );
  }
  return <span className={`${styles.sample} ${styles.ok}`}>{attempts} tentativas</span>;
}

export const dayMonth = (isoDate: string): string => `${isoDate.slice(8, 10)}/${isoDate.slice(5, 7)}`;
