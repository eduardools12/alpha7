import { useId } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import styles from './TrendChart.module.css';

export interface TrendPoint {
  label: string;
  value: number;
  /** Contexto exibido na dica e na tabela alternativa (ex.: "6 atletas"). */
  detail?: string;
}

export interface TrendChartProps {
  data: TrendPoint[];
  /** Descrição do que o gráfico mostra, lida por leitores de tela. */
  ariaLabel: string;
  valueLabel: string;
  height?: number;
}

/**
 * Área de tendência (implementação com Recharts, carregada sob demanda por TrendChart).
 * O gráfico é visual; a tabela oculta logo abaixo entrega os mesmos números a leitores de
 * tela e permite checar valores sem passar o mouse.
 */
export function TrendChartView({ data, ariaLabel, valueLabel, height = 220 }: TrendChartProps) {
  const gradientId = useId();
  const values = data.map((p) => p.value);
  const min = Math.floor(Math.min(...values) - 3);
  const max = Math.ceil(Math.max(...values) + 3);

  return (
    <figure className={styles.figure}>
      <div className={styles.chart} style={{ height }} role="img" aria-label={ariaLabel}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#b9a6d0" stopOpacity={0.55} />
                <stop offset="100%" stopColor="#b9a6d0" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(255,255,255,0.07)" vertical={false} />
            <XAxis dataKey="label" tick={{ fill: '#b6aec3', fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis
              domain={[Math.max(1, min), Math.min(99, max)]}
              tick={{ fill: '#b6aec3', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
              width={44}
              tickCount={4}
              allowDecimals={false}
            />
            <Tooltip
              cursor={{ stroke: '#8f7aa6' }}
              contentStyle={{ background: '#2b2734', border: '1px solid rgba(185,166,208,0.32)', borderRadius: 8 }}
              labelStyle={{ color: '#f1eff4' }}
              itemStyle={{ color: '#e4dcf0' }}
              formatter={(value, _name, item) => {
                const detail = (item.payload as TrendPoint | undefined)?.detail;
                return [detail ? `${value} (${detail})` : value, valueLabel];
              }}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#d3c4f5"
              strokeWidth={2.5}
              fill={`url(#${gradientId})`}
              dot={{ r: 4, fill: '#d3c4f5', stroke: '#270949', strokeWidth: 2 }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{ariaLabel}</caption>
        <thead>
          <tr>
            <th scope="col">Período</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((p, index) => (
            <tr key={`${p.label}-${index}`}>
              <th scope="row">{p.label}</th>
              <td>
                {p.value}
                {p.detail ? ` (${p.detail})` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
