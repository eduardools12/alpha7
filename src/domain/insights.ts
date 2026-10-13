import type { AttributeKey, Attributes } from './attributes';
import { rankAttributes } from './attributes';
import { average } from './metrics';
import { calculateOverall, type OverallWeights } from './overall';
import { evaluationsFor, shortName, type Evaluation, type Player } from './player';

export interface TeamSeriesPoint {
  /** AAAA-MM */
  month: string;
  /** Overall médio dos atletas com avaliação até o fim do mês. */
  value: number;
  /** Quantos atletas entraram na média (o contexto do número). */
  sampleSize: number;
}

function monthOf(isoDate: string): string {
  return isoDate.slice(0, 7);
}

function listMonths(from: string, to: string): string[] {
  const months: string[] = [];
  let [year, month] = from.split('-').map(Number) as [number, number];
  const [endYear, endMonth] = to.split('-').map(Number) as [number, number];
  while (year < endYear || (year === endYear && month <= endMonth)) {
    months.push(`${year}-${String(month).padStart(2, '0')}`);
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }
  return months;
}

/**
 * Overall médio do elenco por mês, usando a última avaliação de cada atleta
 * até o fim daquele mês. Meses sem nenhum atleta avaliado não geram ponto.
 */
export function teamOverallSeries(
  players: readonly Player[],
  evaluations: readonly Evaluation[],
  weights: OverallWeights,
): TeamSeriesPoint[] {
  const dates = evaluations.map((e) => e.evaluatedAt).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  if (!first || !last) return [];

  const points: TeamSeriesPoint[] = [];
  for (const month of listMonths(monthOf(first), monthOf(last))) {
    const overalls: number[] = [];
    for (const player of players) {
      const upToMonth = evaluationsFor(evaluations, player.id).filter((e) => monthOf(e.evaluatedAt) <= month);
      const latest = upToMonth[upToMonth.length - 1];
      if (latest) overalls.push(calculateOverall(latest.attributes, player.primaryPosition, weights));
    }
    const mean = average(overalls);
    if (mean !== null) points.push({ month, value: Math.round(mean * 10) / 10, sampleSize: overalls.length });
  }
  return points;
}

export interface OverallPoint {
  evaluationId: string;
  evaluatedAt: string;
  overall: number;
  evaluator: string;
}

/** Overall de cada avaliação do atleta, recalculado com os pesos atuais. */
export function overallHistory(
  player: Player,
  evaluations: readonly Evaluation[],
  weights: OverallWeights,
): OverallPoint[] {
  return evaluationsFor(evaluations, player.id).map((e) => ({
    evaluationId: e.id,
    evaluatedAt: e.evaluatedAt,
    overall: calculateOverall(e.attributes, player.primaryPosition, weights),
    evaluator: e.evaluator,
  }));
}

export interface PlayerStanding {
  player: Player;
  overall: number;
  /** Diferença para a avaliação anterior; null se só existe uma avaliação. */
  delta: number | null;
}

export function playerStandings(
  players: readonly Player[],
  evaluations: readonly Evaluation[],
  weights: OverallWeights,
): PlayerStanding[] {
  return players.flatMap((player) => {
    const history = overallHistory(player, evaluations, weights);
    const current = history[history.length - 1];
    if (!current) return [];
    const previous = history[history.length - 2];
    return [{ player, overall: current.overall, delta: previous ? current.overall - previous.overall : null }];
  });
}

export function topByOverall(standings: readonly PlayerStanding[], count: number): PlayerStanding[] {
  return [...standings]
    .sort((a, b) => b.overall - a.overall || shortName(a.player.name).localeCompare(shortName(b.player.name)))
    .slice(0, count);
}

export function biggestRisers(standings: readonly PlayerStanding[], count: number): PlayerStanding[] {
  return standings
    .filter((s) => s.delta !== null && s.delta > 0)
    .sort((a, b) => (b.delta ?? 0) - (a.delta ?? 0) || b.overall - a.overall)
    .slice(0, count);
}

const TRAIT_LABEL: Record<AttributeKey, string> = {
  SAC: 'Saque forte',
  REC: 'Recepção',
  LEV: 'Levantamento',
  ATA: 'Atacante',
  BLQ: 'Bloqueador',
  DEF: 'Defensor',
  VEL: 'Velocidade',
  IMP: 'Impulsão',
  LEI: 'Leitura de jogo',
};

/** Etiqueta da carta: o rótulo do maior atributo do atleta (derivado da nota, sem opinião). */
export function playerTrait(attributes: Attributes): string {
  const best = rankAttributes(attributes)[0];
  return best ? TRAIT_LABEL[best.key] : '';
}

export interface AttributeReading {
  strengths: AttributeKey[];
  needsWork: AttributeKey[];
}

/**
 * Pontos fortes e a desenvolver, lidos direto das notas (não é opinião gerada):
 * os `count` maiores e os `count` menores atributos, sem repetir nenhum.
 */
export function readAttributes(attributes: Attributes, count = 3): AttributeReading {
  const ranked = rankAttributes(attributes);
  const strengths = ranked.slice(0, count).map((r) => r.key);
  const needsWork = ranked
    .slice(-Math.min(count - 1, ranked.length - strengths.length))
    .reverse()
    .map((r) => r.key);
  return { strengths, needsWork };
}
