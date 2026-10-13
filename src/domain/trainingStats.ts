import { FUNDAMENTALS, type Fundamental, type FundamentalResult, type OutcomeFor } from './fundamentals';
import { formatPercent, ratio, UNAVAILABLE, type Ratio } from './metrics';
import { validEvents, type Training, type TrainingEvent, type TrainingExercise } from './training';

/**
 * Estatísticas de treino, calculadas SOMENTE de eventos válidos (não anulados), sempre com
 * número de tentativas e denominadores. Fórmulas e critérios: docs/METRICS.md.
 *
 * Todas as funções recebem a lista bruta de eventos e filtram internamente: passar eventos
 * anulados por engano não altera o resultado.
 */

/** Abaixo disso, a amostra é considerada insuficiente para conclusão ou comparação. */
export const MIN_SAMPLE = 10;

export type SampleLevel = 'none' | 'small' | 'adequate';

export function sampleLevel(attempts: number): SampleLevel {
  if (attempts <= 0) return 'none';
  return attempts < MIN_SAMPLE ? 'small' : 'adequate';
}

/**
 * O mínimo que uma estatística de fundamento precisa de um registro: fundamento + resultado coerentes e o carimbo de
 * anulação. Eventos de TREINO e ações técnicas de PARTIDA têm esta forma; as funções abaixo servem aos dois, mas quem
 * chama nunca mistura as duas origens numa mesma conta (docs/METRICS.md).
 */
export type StatEvent = FundamentalResult & { voidedAt: string | null };
/** Registro de um atleta (treino ou partida): permite filtrar e comparar por atleta. */
export type PlayerStatEvent = StatEvent & { playerId: string };

type EventOf<F extends Fundamental> = Extract<StatEvent, { fundamental: F }>;

function select<F extends Fundamental>(events: readonly StatEvent[], fundamental: F): EventOf<F>[] {
  return validEvents(events).filter((e): e is EventOf<F> => e.fundamental === fundamental);
}

function tally<F extends Fundamental>(events: readonly EventOf<F>[], outcomes: readonly OutcomeFor<F>[]) {
  const counts = Object.fromEntries(outcomes.map((o) => [o, 0])) as Record<OutcomeFor<F>, number>;
  for (const event of events) counts[event.outcome as OutcomeFor<F>] += 1;
  return counts;
}

function shares<K extends string>(counts: Record<K, number>, attempts: number): Record<K, Ratio> {
  return Object.fromEntries(
    (Object.keys(counts) as K[]).map((key) => [key, ratio(counts[key], attempts)]),
  ) as Record<K, Ratio>;
}

/** Eficiência pode ser negativa (erros e bloqueios descontam), por isso não usa Ratio. */
export interface Efficiency {
  /** pontos − erros − bloqueados */
  numerator: number;
  attempts: number;
  /** Fração de -1 a 1 (multiplique por 100 para %), ou null sem tentativas. */
  value: number | null;
}

/* ─────────────── saque ─────────────── */

export interface ServeStats {
  attempts: number;
  aces: number;
  valid: number;
  errors: number;
  /** aces ÷ tentativas de saque */
  aceRate: Ratio;
  /** erros de saque ÷ tentativas de saque */
  errorRate: Ratio;
  sample: SampleLevel;
}

export function serveStats(events: readonly StatEvent[]): ServeStats {
  const own = select(events, 'saque');
  const counts = tally(own, ['ace', 'valido', 'erro']);
  const attempts = own.length;
  return {
    attempts,
    aces: counts.ace,
    valid: counts.valido,
    errors: counts.erro,
    aceRate: ratio(counts.ace, attempts),
    errorRate: ratio(counts.erro, attempts),
    sample: sampleLevel(attempts),
  };
}

/* ─────────────── recepção ─────────────── */

/** Pesos da nota interna de recepção (escolha do Alpha7, não padrão oficial). */
export const RECEPTION_SCORE_WEIGHTS = { A: 3, B: 2, C: 1, erro: 0 } as const;
export const RECEPTION_SCORE_MAX = 3;

export interface ReceptionStats {
  attempts: number;
  counts: Record<'A' | 'B' | 'C' | 'erro', number>;
  shares: Record<'A' | 'B' | 'C' | 'erro', Ratio>;
  /** (A + B) ÷ recepções */
  positive: Ratio;
  /** A ÷ recepções */
  perfect: Ratio;
  /** Nota interna de 0 a 3: (3A + 2B + 1C + 0·erro) ÷ recepções. null sem tentativas. */
  score: number | null;
  sample: SampleLevel;
}

export function receptionStats(events: readonly StatEvent[]): ReceptionStats {
  const own = select(events, 'recepcao');
  const counts = tally(own, ['A', 'B', 'C', 'erro']);
  const attempts = own.length;
  const points =
    counts.A * RECEPTION_SCORE_WEIGHTS.A + counts.B * RECEPTION_SCORE_WEIGHTS.B + counts.C * RECEPTION_SCORE_WEIGHTS.C;
  return {
    attempts,
    counts,
    shares: shares(counts, attempts),
    positive: ratio(counts.A + counts.B, attempts),
    perfect: ratio(counts.A, attempts),
    score: attempts === 0 ? null : points / attempts,
    sample: sampleLevel(attempts),
  };
}

/* ─────────────── levantamento ─────────────── */

export interface SettingStats {
  attempts: number;
  counts: Record<'excelente' | 'atacavel' | 'quebrado' | 'erro', number>;
  shares: Record<'excelente' | 'atacavel' | 'quebrado' | 'erro', Ratio>;
  /** (excelente + atacável) ÷ levantamentos. Mede a bola entregue, NÃO o resultado do ataque. */
  attackable: Ratio;
  sample: SampleLevel;
}

export function settingStats(events: readonly StatEvent[]): SettingStats {
  const own = select(events, 'levantamento');
  const counts = tally(own, ['excelente', 'atacavel', 'quebrado', 'erro']);
  const attempts = own.length;
  return {
    attempts,
    counts,
    shares: shares(counts, attempts),
    attackable: ratio(counts.excelente + counts.atacavel, attempts),
    sample: sampleLevel(attempts),
  };
}

/* ─────────────── ataque ─────────────── */

export interface AttackStats {
  attempts: number;
  kills: number;
  errors: number;
  blocked: number;
  other: number;
  /** pontos ÷ tentativas */
  killRate: Ratio;
  errorRate: Ratio;
  blockedRate: Ratio;
  /** (pontos − erros − bloqueados para ponto) ÷ tentativas */
  efficiency: Efficiency;
  sample: SampleLevel;
}

export function attackStats(events: readonly StatEvent[]): AttackStats {
  const own = select(events, 'ataque');
  const counts = tally(own, ['ponto', 'erro', 'bloqueado', 'outra']);
  const attempts = own.length;
  const numerator = counts.ponto - counts.erro - counts.bloqueado;
  return {
    attempts,
    kills: counts.ponto,
    errors: counts.erro,
    blocked: counts.bloqueado,
    other: counts.outra,
    killRate: ratio(counts.ponto, attempts),
    errorRate: ratio(counts.erro, attempts),
    blockedRate: ratio(counts.bloqueado, attempts),
    efficiency: { numerator, attempts, value: attempts === 0 ? null : numerator / attempts },
    sample: sampleLevel(attempts),
  };
}

/* ─────────────── bloqueio ─────────────── */

export interface BlockStats {
  attempts: number;
  points: number;
  noPoint: number;
  errors: number;
  /** pontos de bloqueio ÷ tentativas de bloqueio */
  pointRate: Ratio;
  errorRate: Ratio;
  sample: SampleLevel;
}

export function blockStats(events: readonly StatEvent[]): BlockStats {
  const own = select(events, 'bloqueio');
  const counts = tally(own, ['ponto', 'sem_ponto', 'erro']);
  const attempts = own.length;
  return {
    attempts,
    points: counts.ponto,
    noPoint: counts.sem_ponto,
    errors: counts.erro,
    pointRate: ratio(counts.ponto, attempts),
    errorRate: ratio(counts.erro, attempts),
    sample: sampleLevel(attempts),
  };
}

/* ─────────────── defesa ─────────────── */

export interface DefenseStats {
  attempts: number;
  positive: number;
  recovered: number;
  errors: number;
  /** defesas positivas ÷ tentativas */
  positiveRate: Ratio;
  /** bolas recuperadas (sem contra-ataque) ÷ tentativas */
  recoveredRate: Ratio;
  errorRate: Ratio;
  sample: SampleLevel;
}

export function defenseStats(events: readonly StatEvent[]): DefenseStats {
  const own = select(events, 'defesa');
  const counts = tally(own, ['positiva', 'recuperada', 'erro']);
  const attempts = own.length;
  return {
    attempts,
    positive: counts.positiva,
    recovered: counts.recuperada,
    errors: counts.erro,
    positiveRate: ratio(counts.positiva, attempts),
    recoveredRate: ratio(counts.recuperada, attempts),
    errorRate: ratio(counts.erro, attempts),
    sample: sampleLevel(attempts),
  };
}

/* ─────────────── formatação ─────────────── */

export function formatEfficiency(e: Efficiency, fractionDigits = 1): string {
  if (e.value === null) return UNAVAILABLE;
  const text = Math.abs(e.value * 100).toFixed(fractionDigits).replace('.', ',');
  return `${e.value < 0 ? '−' : ''}${text}%`;
}

export function formatScore(score: number | null, fractionDigits = 2): string {
  return score === null ? UNAVAILABLE : score.toFixed(fractionDigits).replace('.', ',');
}

/* ─────────────── indicador principal por fundamento ─────────────── */

export interface Headline {
  fundamental: Fundamental;
  label: string;
  attempts: number;
  /** Valor para exibir ("12,5%", "2,15", "—"). */
  display: string;
  /** Denominador e contexto ("3 de 24"). */
  context: string;
  /** Valor numérico (maior é melhor) para ordenar; null se indisponível. */
  value: number | null;
  sample: SampleLevel;
}

const NO_ATTEMPTS = 'sem tentativas registradas';

const ratioHeadline = (fundamental: Fundamental, label: string, r: Ratio, sample: SampleLevel): Headline => ({
  fundamental,
  label,
  attempts: r.attempts,
  display: formatPercent(r),
  context: r.attempts === 0 ? NO_ATTEMPTS : `${r.successes} de ${r.attempts}`,
  value: r.value,
  sample,
});

/** Um indicador principal por fundamento, usado em resumos, comparações e no perfil. */
export function headline(fundamental: Fundamental, events: readonly StatEvent[]): Headline {
  switch (fundamental) {
    case 'saque': {
      const s = serveStats(events);
      return ratioHeadline('saque', 'Taxa de ace', s.aceRate, s.sample);
    }
    case 'recepcao': {
      const s = receptionStats(events);
      return {
        fundamental: 'recepcao',
        label: 'Nota interna (0 a 3)',
        attempts: s.attempts,
        display: formatScore(s.score),
        context: s.attempts === 0 ? NO_ATTEMPTS : `${s.attempts} ${s.attempts === 1 ? 'recepção' : 'recepções'}`,
        value: s.score,
        sample: s.sample,
      };
    }
    case 'levantamento': {
      const s = settingStats(events);
      return ratioHeadline('levantamento', 'Excelentes ou atacáveis', s.attackable, s.sample);
    }
    case 'ataque': {
      const s = attackStats(events);
      return {
        fundamental: 'ataque',
        label: 'Eficiência de ataque',
        attempts: s.attempts,
        display: formatEfficiency(s.efficiency),
        context:
          s.attempts === 0
            ? NO_ATTEMPTS
            : `(${s.kills} − ${s.errors} − ${s.blocked}) de ${s.attempts} ${s.attempts === 1 ? 'tentativa' : 'tentativas'}`,
        value: s.efficiency.value,
        sample: s.sample,
      };
    }
    case 'bloqueio': {
      const s = blockStats(events);
      return ratioHeadline('bloqueio', 'Taxa de ponto de bloqueio', s.pointRate, s.sample);
    }
    case 'defesa': {
      const s = defenseStats(events);
      return ratioHeadline('defesa', 'Defesas positivas', s.positiveRate, s.sample);
    }
  }
}

/* ─────────────── comparação entre participantes ─────────────── */

export interface ComparisonRow {
  playerId: string;
  headline: Headline;
  /** true se a amostra do atleta neste fundamento é adequada (≥ MIN_SAMPLE). */
  eligible: boolean;
}

export interface Comparison {
  fundamental: Fundamental;
  rows: ComparisonRow[];
  eligibleCount: number;
  /** Só se compara com pelo menos 2 atletas de amostra adequada. */
  canCompare: boolean;
}

/**
 * Lista os participantes com seu indicador principal. A ordenação por desempenho vale somente
 * entre atletas com amostra adequada; os demais aparecem depois, marcados como insuficientes.
 */
export function compareParticipants(
  events: readonly PlayerStatEvent[],
  playerIds: readonly string[],
  fundamental: Fundamental,
): Comparison {
  const rows: ComparisonRow[] = playerIds.map((playerId) => {
    const h = headline(fundamental, events.filter((e) => e.playerId === playerId));
    return { playerId, headline: h, eligible: h.sample === 'adequate' };
  });
  rows.sort((a, b) => {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    if (a.eligible) return (b.headline.value ?? -Infinity) - (a.headline.value ?? -Infinity);
    return b.headline.attempts - a.headline.attempts;
  });
  const eligibleCount = rows.filter((r) => r.eligible).length;
  return { fundamental, rows, eligibleCount, canCompare: eligibleCount >= 2 };
}

/* ─────────────── resumo do treino ─────────────── */

export interface TrainingSummary {
  participants: number;
  exercises: number;
  validEvents: number;
  voidedEvents: number;
  attemptsByFundamental: Record<Fundamental, number>;
  perExercise: { exerciseId: string; name: string; count: number }[];
  perPlayer: { playerId: string; total: number; byFundamental: Record<Fundamental, number> }[];
}

const emptyByFundamental = (): Record<Fundamental, number> =>
  Object.fromEntries(FUNDAMENTALS.map((f) => [f, 0])) as Record<Fundamental, number>;

export function summarizeTraining(
  training: Training,
  exercises: readonly TrainingExercise[],
  events: readonly TrainingEvent[],
): TrainingSummary {
  const own = events.filter((e) => e.trainingId === training.id);
  const valid = validEvents(own);
  const attemptsByFundamental = emptyByFundamental();
  const perPlayerMap = new Map<string, { total: number; byFundamental: Record<Fundamental, number> }>();
  for (const playerId of training.participantIds) perPlayerMap.set(playerId, { total: 0, byFundamental: emptyByFundamental() });

  for (const event of valid) {
    attemptsByFundamental[event.fundamental] += 1;
    const entry = perPlayerMap.get(event.playerId) ?? { total: 0, byFundamental: emptyByFundamental() };
    entry.total += 1;
    entry.byFundamental[event.fundamental] += 1;
    perPlayerMap.set(event.playerId, entry);
  }

  const ownExercises = exercises.filter((e) => e.trainingId === training.id).sort((a, b) => a.order - b.order);
  return {
    participants: training.participantIds.length,
    exercises: ownExercises.length,
    validEvents: valid.length,
    voidedEvents: own.length - valid.length,
    attemptsByFundamental,
    perExercise: ownExercises.map((exercise) => ({
      exerciseId: exercise.id,
      name: exercise.name,
      count: valid.filter((e) => e.exerciseId === exercise.id).length,
    })),
    perPlayer: [...perPlayerMap.entries()].map(([playerId, value]) => ({ playerId, ...value })),
  };
}
