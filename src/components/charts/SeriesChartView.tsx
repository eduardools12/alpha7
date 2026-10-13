import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from './TrendChart.module.css';

export interface ChartSeries {
  key: string;
  label: string;
  /** Cor em hexadecimal (o SVG do gráfico não lê as variáveis do CSS). */
  color: string;
}

/** Uma categoria do eixo X com um valor (ou null = sem dados) por série. */
export type ChartRow = { label: string } & Record<string, string | number | null>;

export interface SeriesChartProps {
  kind: 'line' | 'bars' | 'stacked';
  rows: ChartRow[];
  series: ChartSeries[];
  /** Descrição do que o gráfico mostra, lida por leitores de tela. */
  ariaLabel: string;
  /** Intervalo do eixo Y. */
  domain: [number, number];
  /** Sufixo do valor ("%"), usado nos eixos e dicas. */
  unit?: string;
  height?: number;
  /**
   * Os MESMOS números em texto, com denominadores, para quem não enxerga o gráfico e para conferência.
   * O gráfico é só apoio visual: nada importante existe só nele.
   */
  alternative: { columns: string[]; rows: { label: string; cells: string[] }[] };
}

const AXIS = { fill: '#b6aec3', fontSize: 12 } as const;

/**
 * Gráfico de linhas, barras ou barras empilhadas (Recharts, carregado sob demanda por SeriesChart). Valores null
 * viram lacunas (nunca zero); a tabela abaixo diz “Sem dados” nesses casos.
 */
export function SeriesChartView({ kind, rows, series, ariaLabel, domain, unit = '', height = 260, alternative }: SeriesChartProps) {
  const common = { data: rows, margin: { top: 8, right: 12, bottom: 0, left: -8 } };
  const grid = <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />;
  const x = <XAxis dataKey="label" tick={AXIS} axisLine={false} tickLine={false} interval="preserveStartEnd" />;
  const y = <YAxis domain={domain} tick={AXIS} axisLine={false} tickLine={false} width={48} tickCount={5} allowDecimals={false} tickFormatter={(v: number) => `${v}${unit}`} />;
  const tooltip = (
    <Tooltip
      cursor={{ fill: 'rgba(255,255,255,0.05)', stroke: '#8f7aa6' }}
      contentStyle={{ background: '#2b2734', border: '1px solid rgba(185,166,208,0.32)', borderRadius: 8 }}
      labelStyle={{ color: '#f1eff4' }}
      itemStyle={{ color: '#e4dcf0' }}
      formatter={(value) => (value === null || value === undefined ? 'Sem dados' : `${value}${unit}`)}
    />
  );
  const legend = series.length > 1 ? <Legend wrapperStyle={{ color: '#e4dcf0', fontSize: 12 }} /> : null;

  return (
    <figure className={styles.figure}>
      <div className={styles.chart} style={{ height }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          {kind === 'line' ? (
            <LineChart {...common}>
              {grid}
              {x}
              {y}
              {tooltip}
              {legend}
              {series.map((s) => (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.5} dot={{ r: 4, fill: s.color }} connectNulls={false} isAnimationActive={false} />
              ))}
            </LineChart>
          ) : (
            <BarChart {...common}>
              {grid}
              {x}
              {y}
              {tooltip}
              {legend}
              {series.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} {...(kind === 'stacked' ? { stackId: 'total' } : {})} radius={kind === 'stacked' ? 0 : [4, 4, 0, 0]} isAnimationActive={false} />
              ))}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div className="sr-only">
      <table>
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Item</th>
            {alternative.columns.map((column) => (
              <th key={column} scope="col">
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {alternative.rows.map((row, index) => (
            <tr key={`${row.label}-${index}`}>
              <th scope="row">{row.label}</th>
              {row.cells.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
    </figure>
  );
}
