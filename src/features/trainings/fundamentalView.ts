import { OUTCOME_INFO, type Fundamental, type OutcomeInfo, type OutcomeTone } from '@/domain/fundamentals';
import { formatPercent, formatRatioContext, ratio as ratioOf, type Ratio } from '@/domain/metrics';
import {
  attackStats,
  blockStats,
  defenseStats,
  formatEfficiency,
  formatScore,
  receptionStats,
  serveStats,
  settingStats,
  RECEPTION_SCORE_MAX,
  type SampleLevel,
  type StatEvent,
} from '@/domain/trainingStats';

export interface DistributionItem {
  key: string;
  label: string;
  count: number;
  share: Ratio;
  tone: OutcomeTone;
}

export interface MetricLine {
  label: string;
  /** Valor principal ("12,5%", "2,25 de 3,00", "—"). */
  value: string;
  /** Denominador e contexto ("3 de 24"). */
  context: string;
  /** Como é calculado, para o leitor conferir. */
  formula?: string;
}

export interface FundamentalView {
  fundamental: Fundamental;
  attempts: number;
  sample: SampleLevel;
  distribution: DistributionItem[];
  metrics: MetricLine[];
  /** Observação de interpretação (ex.: separar levantada de ataque). */
  note?: string;
}

function items(fundamental: Fundamental, counts: Record<string, number>, shares: Record<string, Ratio>): DistributionItem[] {
  const table = OUTCOME_INFO[fundamental] as Record<string, OutcomeInfo>;
  return Object.keys(table).map((key) => ({
    key,
    label: (table[key] as OutcomeInfo).label,
    count: counts[key] ?? 0,
    share: shares[key] as Ratio,
    tone: (table[key] as OutcomeInfo).tone,
  }));
}

const line = (label: string, r: Ratio, formula?: string): MetricLine => ({
  label,
  value: formatPercent(r),
  context: formatRatioContext(r),
  ...(formula ? { formula } : {}),
});

/** Estatísticas de um fundamento, prontas para exibir, a partir de eventos de treino. */
export function viewFundamental(fundamental: Fundamental, events: readonly StatEvent[]): FundamentalView {
  switch (fundamental) {
    case 'saque': {
      const s = serveStats(events);
      return {
        fundamental,
        attempts: s.attempts,
        sample: s.sample,
        distribution: items(fundamental, { ace: s.aces, valido: s.valid, erro: s.errors }, {
          ace: s.aceRate,
          valido: ratioOf(s.valid, s.attempts),
          erro: s.errorRate,
        }),
        metrics: [line('Taxa de ace', s.aceRate, 'aces ÷ tentativas de saque'), line('Taxa de erro', s.errorRate, 'erros de saque ÷ tentativas de saque')],
      };
    }
    case 'recepcao': {
      const s = receptionStats(events);
      return {
        fundamental,
        attempts: s.attempts,
        sample: s.sample,
        distribution: items(fundamental, s.counts, s.shares),
        metrics: [
          {
            label: 'Nota interna de qualidade',
            value: s.score === null ? '—' : `${formatScore(s.score)} de ${formatScore(RECEPTION_SCORE_MAX)}`,
            context: s.attempts === 0 ? 'sem tentativas registradas' : `${s.attempts} ${s.attempts === 1 ? 'recepção' : 'recepções'}`,
            formula: '(3×A + 2×B + 1×C + 0×erro) ÷ recepções. Escolha do Alpha7, não padrão oficial.',
          },
          line('Recepção positiva (A + B)', s.positive, '(A + B) ÷ recepções'),
          line('Recepção perfeita (A)', s.perfect, 'A ÷ recepções'),
        ],
      };
    }
    case 'levantamento': {
      const s = settingStats(events);
      return {
        fundamental,
        attempts: s.attempts,
        sample: s.sample,
        distribution: items(fundamental, s.counts, s.shares),
        metrics: [line('Excelentes ou atacáveis', s.attackable, '(excelente + atacável) ÷ levantamentos')],
        note: 'Mede a bola entregue ao atacante. O resultado do ataque é outro indicador e não entra aqui.',
      };
    }
    case 'ataque': {
      const s = attackStats(events);
      return {
        fundamental,
        attempts: s.attempts,
        sample: s.sample,
        distribution: items(fundamental, { ponto: s.kills, erro: s.errors, bloqueado: s.blocked, outra: s.other }, {
          ponto: s.killRate,
          erro: s.errorRate,
          bloqueado: s.blockedRate,
          outra: ratioOf(s.other, s.attempts),
        }),
        metrics: [
          {
            label: 'Eficiência de ataque',
            value: formatEfficiency(s.efficiency),
            context:
              s.attempts === 0
                ? 'sem tentativas registradas'
                : `(${s.kills} − ${s.errors} − ${s.blocked}) de ${s.attempts} ${s.attempts === 1 ? 'tentativa' : 'tentativas'}`,
            formula: '(pontos − erros − bloqueados para ponto) ÷ tentativas × 100. Pode ser negativa.',
          },
          line('Taxa de ponto', s.killRate, 'pontos de ataque ÷ tentativas'),
        ],
      };
    }
    case 'bloqueio': {
      const s = blockStats(events);
      return {
        fundamental,
        attempts: s.attempts,
        sample: s.sample,
        distribution: items(fundamental, { ponto: s.points, sem_ponto: s.noPoint, erro: s.errors }, {
          ponto: s.pointRate,
          sem_ponto: ratioOf(s.noPoint, s.attempts),
          erro: s.errorRate,
        }),
        metrics: [line('Taxa de ponto de bloqueio', s.pointRate, 'pontos de bloqueio ÷ tentativas'), line('Taxa de erro', s.errorRate, 'erros de bloqueio ÷ tentativas')],
      };
    }
    case 'defesa': {
      const s = defenseStats(events);
      return {
        fundamental,
        attempts: s.attempts,
        sample: s.sample,
        distribution: items(fundamental, { positiva: s.positive, recuperada: s.recovered, erro: s.errors }, {
          positiva: s.positiveRate,
          recuperada: s.recoveredRate,
          erro: s.errorRate,
        }),
        metrics: [
          line('Defesas positivas', s.positiveRate, 'defesas positivas ÷ tentativas'),
          line('Bolas recuperadas', s.recoveredRate, 'recuperadas ÷ tentativas'),
          line('Taxa de erro', s.errorRate, 'erros ÷ tentativas'),
        ],
      };
    }
  }
}

export const SAMPLE_NOTE: Record<Exclude<SampleLevel, 'adequate'>, (n: number) => string> = {
  none: () => 'Sem tentativas registradas neste fundamento.',
  small: (n) => `Amostra insuficiente: só ${n} ${n === 1 ? 'tentativa' : 'tentativas'}. Não tire conclusões destes percentuais.`,
};
