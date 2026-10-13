import { ATTRIBUTE_KEYS, type AttributeKey, type Attributes, ATTRIBUTE_MAX, ATTRIBUTE_MIN } from './attributes';
import { POSITIONS, type Position } from './positions';

/**
 * Overall = média ponderada dos atributos, com pesos próprios de cada posição.
 *
 *   overall = round( Σ(valor_i × peso_i) / Σ(peso_i) )
 *
 * Os pesos abaixo são PROVISÓRIOS: uma escolha de modelagem do Alpha7, não uma
 * classificação científica. Eles são configuráveis e a fórmula é sempre explicável
 * (veja explainOverall).
 */
export type PositionWeights = Record<AttributeKey, number>;
export type OverallWeights = Record<Position, PositionWeights>;

export const MAX_WEIGHT = 100;

export const DEFAULT_OVERALL_WEIGHTS: OverallWeights = {
  levantador: { SAC: 8, REC: 4, LEV: 34, ATA: 4, BLQ: 8, DEF: 10, VEL: 8, IMP: 4, LEI: 20 },
  oposto: { SAC: 12, REC: 2, LEV: 0, ATA: 34, BLQ: 14, DEF: 8, VEL: 8, IMP: 14, LEI: 8 },
  ponteiro: { SAC: 12, REC: 22, LEV: 0, ATA: 22, BLQ: 6, DEF: 16, VEL: 8, IMP: 8, LEI: 6 },
  central: { SAC: 8, REC: 0, LEV: 0, ATA: 22, BLQ: 36, DEF: 4, VEL: 8, IMP: 14, LEI: 8 },
  libero: { SAC: 0, REC: 32, LEV: 8, ATA: 0, BLQ: 0, DEF: 34, VEL: 12, IMP: 0, LEI: 14 },
};

export function cloneWeights(weights: OverallWeights): OverallWeights {
  return Object.fromEntries(POSITIONS.map((position) => [position, { ...weights[position] }])) as OverallWeights;
}

export function totalWeight(weights: PositionWeights): number {
  return ATTRIBUTE_KEYS.reduce((sum, key) => sum + weights[key], 0);
}

/** Retorna uma mensagem de erro, ou null se os pesos de uma posição forem utilizáveis. */
export function validatePositionWeights(weights: PositionWeights): string | null {
  for (const key of ATTRIBUTE_KEYS) {
    const value = weights[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_WEIGHT) {
      return `O peso de ${key} deve ser um número entre 0 e ${MAX_WEIGHT}.`;
    }
  }
  if (totalWeight(weights) <= 0) return 'Pelo menos um atributo precisa ter peso maior que zero.';
  return null;
}

/** Devolve uma cópia dos pesos com um valor alterado, rejeitando valores inválidos. */
export function withWeight(
  weights: OverallWeights,
  position: Position,
  key: AttributeKey,
  value: number,
): OverallWeights {
  if (!Number.isFinite(value) || value < 0 || value > MAX_WEIGHT) {
    throw new RangeError(`O peso de ${key} deve ser um número entre 0 e ${MAX_WEIGHT}.`);
  }
  return { ...weights, [position]: { ...weights[position], [key]: value } };
}

export interface OverallContribution {
  key: AttributeKey;
  value: number;
  /** Peso relativo, em % do total da posição. */
  weightPercent: number;
  /** Pontos que este atributo soma ao Overall (valor × peso relativo). */
  points: number;
}

export interface OverallExplanation {
  position: Position;
  overall: number;
  /** Média ponderada antes do arredondamento. */
  rawScore: number;
  contributions: OverallContribution[];
}

export function explainOverall(
  attributes: Attributes,
  position: Position,
  weights: OverallWeights = DEFAULT_OVERALL_WEIGHTS,
): OverallExplanation {
  const positionWeights = weights[position];
  const problem = validatePositionWeights(positionWeights);
  if (problem) throw new RangeError(problem);

  const total = totalWeight(positionWeights);
  const contributions = ATTRIBUTE_KEYS.map((key) => {
    const share = positionWeights[key] / total;
    return { key, value: attributes[key], weightPercent: share * 100, points: attributes[key] * share };
  });
  const rawScore = contributions.reduce((sum, item) => sum + item.points, 0);
  const overall = Math.min(ATTRIBUTE_MAX, Math.max(ATTRIBUTE_MIN, Math.round(rawScore)));
  return { position, overall, rawScore, contributions };
}

export function calculateOverall(
  attributes: Attributes,
  position: Position,
  weights: OverallWeights = DEFAULT_OVERALL_WEIGHTS,
): number {
  return explainOverall(attributes, position, weights).overall;
}
