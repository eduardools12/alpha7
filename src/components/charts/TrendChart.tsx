import { lazy, Suspense } from 'react';
import type { TrendChartProps } from './TrendChartView';
import styles from './TrendChart.module.css';

export type { TrendPoint } from './TrendChartView';

// Recharts é a maior parte do pacote: só é baixado quando um gráfico aparece na tela.
const View = lazy(() => import('./TrendChartView').then((m) => ({ default: m.TrendChartView })));

export function TrendChart(props: TrendChartProps) {
  return (
    <Suspense
      fallback={
        <div
          className={styles.placeholder}
          style={{ height: props.height ?? 220 }}
          role="status"
          aria-live="polite"
        >
          Carregando gráfico…
        </div>
      }
    >
      <View {...props} />
    </Suspense>
  );
}
