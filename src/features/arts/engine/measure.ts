import { FONT_DEFS, type FontKey } from './fonts';

/** Caixa de tinta do texto, relativa ao ponto de partida (x, linha de base). `top` é negativo (acima da linha). */
export interface InkBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Mede um texto em `size` px com `letterSpacing` px entre as letras. */
export type Measure = (text: string, font: FontKey, size: number, letterSpacing: number) => InkBox;

const REFERENCE = 200;

/**
 * Medição de verdade: canvas 2D com as fontes das artes já carregadas (`loadArtFonts`). Mede uma vez em 200 px e
 * escala, então o resultado é estável para o mesmo texto.
 */
export function createCanvasMeasure(): Measure | null {
  // jsdom não tem canvas e escreve um erro no console ao tentar: nem tenta.
  if (typeof document === 'undefined' || /jsdom/i.test(navigator.userAgent)) return null;
  const context = document.createElement('canvas').getContext('2d');
  if (!context) return null;
  const cache = new Map<string, TextMetrics>();
  return (text, font, size, letterSpacing) => {
    const def = FONT_DEFS[font];
    const key = `${font}|${text}`;
    let metrics = cache.get(key);
    if (!metrics) {
      context.font = `${def.weight} ${REFERENCE}px "${def.family}"`;
      metrics = context.measureText(text);
      cache.set(key, metrics);
    }
    const k = size / REFERENCE;
    return {
      left: -metrics.actualBoundingBoxLeft * k,
      top: -metrics.actualBoundingBoxAscent * k,
      right: metrics.actualBoundingBoxRight * k + letterSpacing * Math.max(text.length - 1, 0),
      bottom: metrics.actualBoundingBoxDescent * k,
    };
  };
}

/**
 * Medição aproximada pelas proporções do desenho de cada fonte: serve aos testes (jsdom não tem canvas) e de reserva.
 * É determinística; não é a medida que o navegador usa.
 */
export const approximateMeasure: Measure = (text, font, size, letterSpacing) => {
  const { advance, cap } = FONT_DEFS[font].approx;
  const lower = /[a-zç-ÿ]/.test(text) ? 0.92 : 1;
  return {
    left: 0,
    top: -cap * size,
    right: text.length * advance * lower * size + letterSpacing * Math.max(text.length - 1, 0),
    bottom: /[gjpqyç,;]/i.test(text) ? 0.2 * size : 0,
  };
};

/** O melhor medidor disponível agora. */
export function bestMeasure(): Measure {
  return createCanvasMeasure() ?? approximateMeasure;
}

/** Altura das maiúsculas (acima da linha de base) em `size` px. */
export const capHeight = (font: FontKey, size: number): number => FONT_DEFS[font].approx.cap * size;
