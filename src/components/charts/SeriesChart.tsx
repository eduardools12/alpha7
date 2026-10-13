import { lazy, Suspense } from 'react';
import type { SeriesChartProps } from './SeriesChartView';
import styles from './TrendChart.module.css';

export type { ChartRow, ChartSeries } from './SeriesChartView';

// Recharts é a maior parte do pacote: só é baixado quando um gráfico aparece na tela.
const View = lazy(() => import('./SeriesChartView').then((m) => ({ default: m.SeriesChartView })));

export function SeriesChart(props: SeriesChartProps) {
  return (
    <Suspense
      fallback={
        <div className={styles.placeholder} style={{ height: props.height ?? 260 }} role="status" aria-live="polite">
          Carregando gráfico…
        </div>
      }
    >
      <View {...props} />
    </Suspense>
  );
}
