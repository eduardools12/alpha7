/**
 * Geometria do sistema visual: todas as diagonais seguem o ângulo medido no monograma A7 (25,6° a 26,4° em relação
 * à vertical). Medidas em pixels do desenho (1080 de largura).
 */

export const ANGLE_DEGREES = 26;
/** Deslocamento horizontal por unidade de altura. */
export const SLANT = Math.tan((ANGLE_DEGREES * Math.PI) / 180);

export type Point = readonly [number, number];

/**
 * Paralelogramo inclinado ("/"): (x, yBottom) é o canto inferior esquerdo da base; o topo se desloca para a direita
 * em `height * SLANT`. Devolve os quatro pontos.
 */
export function paraPoints(x: number, yBottom: number, width: number, height: number): Point[] {
  const shift = height * SLANT;
  return [
    [x + shift, yBottom - height],
    [x + shift + width, yBottom - height],
    [x + width, yBottom],
    [x, yBottom],
  ];
}

/** O mesmo paralelogramo recuado `inset` px (medida perpendicular) em todos os lados: a linha interna do desenho. */
export function insetParaPoints(x: number, yBottom: number, width: number, height: number, inset: number): Point[] {
  const dx = inset / Math.cos((ANGLE_DEGREES * Math.PI) / 180);
  return paraPoints(x + inset * SLANT + dx, yBottom - inset, width - 2 * dx, height - 2 * inset);
}

export const pointsAttr = (points: readonly Point[]): string => points.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(' ');

/** Largura total ocupada por uma faixa de altura `height` cuja parte reta mede `width`. */
export const bandSpan = (width: number, height: number): number => width + height * SLANT;
