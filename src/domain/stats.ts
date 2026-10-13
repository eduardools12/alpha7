import { FUNDAMENTALS, type Fundamental } from './fundamentals';
import { activeRallies, matchState, type Match, type MatchSet, type Rally, type RallyAction } from './match';
import { ratio, type Ratio } from './metrics';
import type { Player } from './player';
import type { Position } from './positions';
import type { Training, TrainingEvent } from './training';
import { validEvents } from './training';
import {
  MIN_SAMPLE,
  attackStats,
  blockStats,
  compareParticipants,
  defenseStats,
  headline,
  receptionStats,
  sampleLevel,
  serveStats,
  settingStats,
  type Comparison,
  type Headline,
  type SampleLevel,
  type StatEvent,
} from './trainingStats';

/**
 * ESTATÍSTICAS CONSOLIDADAS (treinos + partidas). Regras puras; fórmulas e critérios em docs/METRICS.md.
 *
 * Princípios que este módulo garante:
 *  - Treino e partida NUNCA são somados num número só: cada indicador diz de qual origem vem e as duas aparecem lado a lado.
 *  - Todo percentual vem com acertos e tentativas (Ratio). Sem tentativas: null, nunca 0%.
 *  - Só registros válidos entram (pontos e ações anulados são ignorados).
 *  - Ação técnica (fundamento observado) e motivo do ponto são medidas diferentes do mesmo jogo: nenhuma conta soma as duas.
 *  - Nada aqui altera avaliações (notas 1 a 99) nem o Overall.
 */

export interface StatsData {
  players: readonly Player[];
  trainings: readonly Training[];
  trainingEvents: readonly TrainingEvent[];
  matches: readonly Match[];
  matchSets: readonly MatchSet[];
  rallies: readonly Rally[];
  rallyActions: readonly RallyAction[];
}

export interface StatsFilter {
  /** Datas AAAA-MM-DD (inclusivas); vazio = sem limite. */
  from: string;
  to: string;
  /** Atleta (vazio = todos). Vale para fundamentos; os indicadores de ponto são da equipe. */
  playerId: string;
  /** Fundamento (vazio = todos). */
  fundamental: Fundamental | '';
  /** Um treino específico (vazio = todos os do período). */
  trainingId: string;
  /** Uma partida específica (vazio = todas as do período). */
  matchId: string;
  /** Rotação do Alpha7 (0 a 5) em que o ponto começou; só vale para partidas. null = todas. */
  rotation: number | null;
}

export const EMPTY_FILTER: StatsFilter = { from: '', to: '', playerId: '', fundamental: '', trainingId: '', matchId: '', rotation: null };

export const hasFilter = (filter: StatsFilter): boolean => JSON.stringify(filter) !== JSON.stringify(EMPTY_FILTER);

/** Data de uma partida para filtros e gráficos: a marcada para o jogo, ou (sem data) a do cadastro. */
export const matchDate = (match: Match): string => (match.scheduledAt !== '' ? match.scheduledAt.slice(0, 10) : match.createdAt.slice(0, 10));

const inPeriod = (date: string, filter: Pick<StatsFilter, 'from' | 'to'>): boolean =>
  (filter.from === '' || date >= filter.from) && (filter.to === '' || date <= filter.to);

/** Rotação 0 a 5 de um ponto (o campo guarda a contagem desde o início do set; o rodízio repete a cada 6). */
export const rotationOf = (rally: Rally): number => rally.rotation % 6;
export const rotationLabel = (rotation: number): string => `Rotação ${rotation + 1}`;

/* ─────────────── recorte ─────────────── */

export interface Scoped {
  trainings: Training[];
  /** Eventos de treino VÁLIDOS, já filtrados por período/treino/atleta/fundamento. */
  trainingEvents: TrainingEvent[];
  matches: Match[];
  /** Pontos ATIVOS das partidas do recorte, filtrados por rotação (NÃO por atleta: o ponto é da equipe). */
  rallies: Rally[];
  /** Ações técnicas VÁLIDAS de partida, filtradas por período/partida/rotação/atleta/fundamento. */
  actions: RallyAction[];
}

export function scope(data: StatsData, filter: StatsFilter): Scoped {
  const trainings = data.trainings.filter((t) => inPeriod(t.date, filter) && (filter.trainingId === '' || t.id === filter.trainingId));
  const trainingIds = new Set(trainings.map((t) => t.id));
  const matches = data.matches.filter((m) => inPeriod(matchDate(m), filter) && (filter.matchId === '' || m.id === filter.matchId));
  const matchIds = new Set(matches.map((m) => m.id));

  const rallies = activeRallies(data.rallies).filter((r) => matchIds.has(r.matchId) && (filter.rotation === null || rotationOf(r) === filter.rotation));
  const rallyIds = new Set(rallies.map((r) => r.id));
  const byRotation = filter.rotation !== null;

  const keep = (e: { fundamental: Fundamental; playerId: string }) =>
    (filter.fundamental === '' || e.fundamental === filter.fundamental) && (filter.playerId === '' || e.playerId === filter.playerId);

  return {
    trainings,
    trainingEvents: validEvents(data.trainingEvents).filter((e) => trainingIds.has(e.trainingId) && keep(e)),
    matches,
    rallies,
    actions: validEvents(data.rallyActions).filter((a) => matchIds.has(a.matchId) && (!byRotation || rallyIds.has(a.rallyId)) && keep(a)),
  };
}

/* ─────────────── indicadores de ponto (da equipe) ─────────────── */

export interface RallyIndicators {
  /** Pontos do Alpha7 ÷ pontos jogados. */
  points: Ratio;
  /** Side-out: pontos ganhos quando o ADVERSÁRIO sacava ÷ pontos jogados com o adversário sacando. */
  sideOut: Ratio;
  /** Ponto de saque (break point): pontos ganhos quando o ALPHA7 sacava ÷ pontos jogados com o Alpha7 sacando. */
  breakPoint: Ratio;
}

export function rallyIndicators(rallies: readonly Rally[]): RallyIndicators {
  const own = activeRallies(rallies);
  const receiving = own.filter((r) => r.servingSide === 'them');
  const serving = own.filter((r) => r.servingSide === 'us');
  return {
    points: ratio(own.filter((r) => r.winnerSide === 'us').length, own.length),
    sideOut: ratio(receiving.filter((r) => r.winnerSide === 'us').length, receiving.length),
    breakPoint: ratio(serving.filter((r) => r.winnerSide === 'us').length, serving.length),
  };
}

export interface RotationRow extends RallyIndicators {
  rotation: number;
  label: string;
  rallies: number;
}

/** Sempre as seis rotações (a rotação sem pontos aparece com “sem dados”, não some). */
export function byRotation(rallies: readonly Rally[]): RotationRow[] {
  const own = activeRallies(rallies);
  return [0, 1, 2, 3, 4, 5].map((rotation) => {
    const inRotation = own.filter((r) => rotationOf(r) === rotation);
    return { rotation, label: rotationLabel(rotation), rallies: inRotation.length, ...rallyIndicators(inRotation) };
  });
}

/** Nível de amostra de um percentual, pelo denominador. */
export const sampleOf = (r: Ratio): SampleLevel => sampleLevel(r.attempts);

/* ─────────────── evolução no tempo ─────────────── */

export interface MatchPoint extends RallyIndicators {
  matchId: string;
  label: string;
  date: string;
  rallies: number;
}

/** Um ponto por partida (em ordem de data), com os indicadores de ponto dela. Partida sem pontos não entra. */
export function matchEvolution(matches: readonly Match[], rallies: readonly Rally[]): MatchPoint[] {
  return [...matches]
    .sort((a, b) => matchDate(a).localeCompare(matchDate(b)) || a.createdAt.localeCompare(b.createdAt))
    .flatMap((match) => {
      const own = activeRallies(rallies).filter((r) => r.matchId === match.id);
      return own.length === 0 ? [] : [{ matchId: match.id, label: match.opponent, date: matchDate(match), rallies: own.length, ...rallyIndicators(own) }];
    });
}

export interface SessionPoint {
  id: string;
  label: string;
  date: string;
  headline: Headline;
}

/** Indicador principal de um fundamento em cada treino (em ordem de data). Treino sem tentativas dele não entra. */
export function trainingEvolution(trainings: readonly Training[], events: readonly TrainingEvent[], fundamental: Fundamental): SessionPoint[] {
  return [...trainings]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    .flatMap((training) => {
      const own = events.filter((e) => e.trainingId === training.id && e.fundamental === fundamental);
      return own.length === 0 ? [] : [{ id: training.id, label: training.name, date: training.date, headline: headline(fundamental, own) }];
    });
}

/** Indicador principal de um fundamento em cada partida, a partir das ações técnicas registradas nela. */
export function matchActionEvolution(matches: readonly Match[], actions: readonly RallyAction[], fundamental: Fundamental): SessionPoint[] {
  return [...matches]
    .sort((a, b) => matchDate(a).localeCompare(matchDate(b)) || a.createdAt.localeCompare(b.createdAt))
    .flatMap((match) => {
      const own = actions.filter((a) => a.matchId === match.id && a.fundamental === fundamental);
      return own.length === 0 ? [] : [{ id: match.id, label: match.opponent, date: matchDate(match), headline: headline(fundamental, own) }];
    });
}

/* ─────────────── treino x partida (lado a lado, nunca somados) ─────────────── */

export interface ContextRow {
  fundamental: Fundamental;
  training: Headline;
  match: Headline;
}

export function contextComparison(trainingEvents: readonly StatEvent[], actions: readonly StatEvent[], fundamentals: readonly Fundamental[] = FUNDAMENTALS): ContextRow[] {
  return fundamentals.map((fundamental) => ({ fundamental, training: headline(fundamental, trainingEvents), match: headline(fundamental, actions) }));
}

/* ─────────────── um percentual por fundamento (para gráficos comparáveis) ─────────────── */

export interface ChartIndicator {
  label: string;
  ratio: Ratio;
}

/**
 * Um indicador EM PERCENTUAL por fundamento, para colocar fundamentos diferentes (e treino x partida) no mesmo gráfico.
 * Não substitui o indicador principal de cada fundamento (a nota de recepção e a eficiência de ataque ficam nos cartões):
 * aqui recepção = positivas (A+B) e ataque = pontos ÷ tentativas, sempre com acertos e tentativas.
 */
export function chartIndicator(fundamental: Fundamental, events: readonly StatEvent[]): ChartIndicator {
  switch (fundamental) {
    case 'saque':
      return { label: 'Taxa de ace', ratio: serveStats(events).aceRate };
    case 'recepcao':
      return { label: 'Recepções positivas (A + B)', ratio: receptionStats(events).positive };
    case 'levantamento':
      return { label: 'Levantamentos excelentes ou atacáveis', ratio: settingStats(events).attackable };
    case 'ataque':
      return { label: 'Ataques que viraram ponto', ratio: attackStats(events).killRate };
    case 'bloqueio':
      return { label: 'Taxa de ponto de bloqueio', ratio: blockStats(events).pointRate };
    case 'defesa':
      return { label: 'Defesas positivas', ratio: defenseStats(events).positiveRate };
  }
}

export interface IndicatorPoint {
  id: string;
  label: string;
  date: string;
  source: 'treino' | 'partida';
  ratio: Ratio;
}

/**
 * Evolução do indicador em % de um fundamento, sessão por sessão (treinos e partidas misturados SÓ na linha do tempo:
 * cada ponto sabe de qual origem é e nunca soma as duas). Sessão sem tentativas do fundamento não gera ponto.
 */
export function indicatorEvolution(scoped: Scoped, fundamental: Fundamental): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  for (const training of scoped.trainings) {
    const events = scoped.trainingEvents.filter((e) => e.trainingId === training.id && e.fundamental === fundamental);
    if (events.length > 0) points.push({ id: training.id, label: training.name, date: training.date, source: 'treino', ratio: chartIndicator(fundamental, events).ratio });
  }
  for (const match of scoped.matches) {
    const events = scoped.actions.filter((a) => a.matchId === match.id && a.fundamental === fundamental);
    if (events.length > 0) points.push({ id: match.id, label: match.opponent, date: matchDate(match), source: 'partida', ratio: chartIndicator(fundamental, events).ratio });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label, 'pt-BR'));
}

/* ─────────────── comparação entre atletas da mesma posição ─────────────── */

export function positionComparison(
  players: readonly Player[],
  events: readonly (StatEvent & { playerId: string })[],
  position: Position,
  fundamental: Fundamental,
): Comparison {
  const ids = players.filter((p) => p.primaryPosition === position).map((p) => p.id);
  return compareParticipants(events, ids, fundamental);
}

/* ─────────────── período anterior ─────────────── */

const DAY = 86_400_000;
const parse = (iso: string): number => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
const format = (time: number): string => new Date(time).toISOString().slice(0, 10);

/** O período imediatamente anterior, do mesmo tamanho em dias. Precisa de início e fim; senão null. */
export function previousPeriod(from: string, to: string): { from: string; to: string } | null {
  if (from === '' || to === '' || to < from) return null;
  const days = Math.round((parse(to) - parse(from)) / DAY) + 1;
  const prevTo = parse(from) - DAY;
  return { from: format(prevTo - (days - 1) * DAY), to: format(prevTo) };
}

export interface PeriodRow {
  fundamental: Fundamental;
  current: Headline;
  previous: Headline;
  /** Diferença (atual − anterior) só quando as DUAS amostras são adequadas; senão null. */
  difference: number | null;
}

export function periodComparison(current: readonly StatEvent[], previous: readonly StatEvent[], fundamentals: readonly Fundamental[] = FUNDAMENTALS): PeriodRow[] {
  return fundamentals.map((fundamental) => {
    const a = headline(fundamental, current);
    const b = headline(fundamental, previous);
    const comparable = a.sample === 'adequate' && b.sample === 'adequate' && a.value !== null && b.value !== null;
    return { fundamental, current: a, previous: b, difference: comparable ? (a.value ?? 0) - (b.value ?? 0) : null };
  });
}

/* ─────────────── leitura individual: o que os dados mostram ─────────────── */

/**
 * Diferença mínima, entre o atleta e a média da equipe, para ser citada. Escolha inicial do Alpha7 (a validar):
 * 10 pontos percentuais nos indicadores em %, 0,30 na nota de recepção (escala de 0 a 3).
 */
export const OBSERVATION_GAP = { ratio: 0.1, receptionScore: 0.3 } as const;

export interface Observation {
  fundamental: Fundamental;
  context: 'treino' | 'partida';
  direction: 'acima' | 'abaixo';
  /** Frase descritiva, sempre com os números e as tentativas. Descreve o que foi observado; não explica causa. */
  text: string;
}

const CONTEXT_LABEL = { treino: 'nos treinos', partida: 'nas partidas' } as const;

/**
 * Compara o atleta com a média da equipe NO MESMO CONTEXTO (treino com treino, partida com partida) e só fala quando
 * as duas amostras são adequadas (≥ MIN_SAMPLE) e a diferença passa de OBSERVATION_GAP. A média da equipe inclui o atleta.
 * Não existe conclusão automática: o texto só descreve números.
 */
export function observationsFor(
  context: 'treino' | 'partida',
  player: readonly StatEvent[],
  team: readonly StatEvent[],
  fundamentals: readonly Fundamental[] = FUNDAMENTALS,
): Observation[] {
  const out: Observation[] = [];
  for (const fundamental of fundamentals) {
    const mine = headline(fundamental, player);
    const all = headline(fundamental, team);
    if (mine.sample !== 'adequate' || all.sample !== 'adequate' || mine.value === null || all.value === null) continue;
    const gap = mine.value - all.value;
    const limit = fundamental === 'recepcao' ? OBSERVATION_GAP.receptionScore : OBSERVATION_GAP.ratio;
    if (Math.abs(gap) < limit) continue;
    const direction = gap > 0 ? 'acima' : 'abaixo';
    out.push({
      fundamental,
      context,
      direction,
      text: `${mine.label} ${CONTEXT_LABEL[context]}: ${mine.display} (${mine.context}), ${direction} da média da equipe (${all.display}, ${all.context}).`,
    });
  }
  return out;
}

/* ─────────────── resultados por partida de um atleta ─────────────── */

export interface PlayerMatchRow {
  match: Match;
  setsUs: number;
  setsThem: number;
  /** Ações técnicas do atleta nesta partida, por fundamento (só os que ele teve). */
  attempts: Partial<Record<Fundamental, number>>;
  total: number;
  /** Pontos em que o atleta foi o envolvido (motivo do ponto) e pontos jogados quando ele sacava. */
  involved: number;
  servedRallies: number;
  servedWon: number;
}

export function playerMatches(data: StatsData, scoped: Scoped, playerId: string): PlayerMatchRow[] {
  return [...scoped.matches]
    .sort((a, b) => matchDate(a).localeCompare(matchDate(b)) || a.createdAt.localeCompare(b.createdAt))
    .flatMap((match) => {
      const mine = scoped.actions.filter((a) => a.matchId === match.id && a.playerId === playerId);
      const rallies = scoped.rallies.filter((r) => r.matchId === match.id);
      const involved = rallies.filter((r) => r.playerId === playerId).length;
      const served = rallies.filter((r) => r.serverPlayerId === playerId);
      if (mine.length === 0 && involved === 0 && served.length === 0) return [];
      const state = matchState(match, data.matchSets, data.rallies);
      const attempts: Partial<Record<Fundamental, number>> = {};
      for (const a of mine) attempts[a.fundamental] = (attempts[a.fundamental] ?? 0) + 1;
      return [
        {
          match,
          setsUs: state.setsUs,
          setsThem: state.setsThem,
          attempts,
          total: mine.length,
          involved,
          servedRallies: served.length,
          servedWon: served.filter((r) => r.winnerSide === 'us').length,
        },
      ];
    });
}

export { MIN_SAMPLE };
