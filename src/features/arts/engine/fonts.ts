import displayBold from '@fontsource/big-shoulders/files/big-shoulders-latin-700-normal.woff2?inline';
import uiRegular from '@fontsource/instrument-sans/files/instrument-sans-latin-400-normal.woff2?inline';
import uiBold from '@fontsource/instrument-sans/files/instrument-sans-latin-700-normal.woff2?inline';

/**
 * Fontes das artes: Big Shoulders Bold (títulos, números, nomes) e Instrument Sans (rótulos e apoio). Vão embutidas no
 * SVG como data URI para o PNG sair idêntico em qualquer aparelho, sem pedir nada à rede. Os nomes de família são
 * próprios das artes para não colidirem com as fontes da interface (Inter e Barlow Condensed).
 */
export type FontKey = 'display' | 'ui' | 'uiBold';

export interface FontDef {
  family: string;
  weight: 400 | 700;
  /** woff2 como data URI. */
  source: string;
  /** Proporções do desenho (fração do corpo), usadas só pela medição aproximada quando não há canvas (testes). */
  approx: { advance: number; cap: number };
}

export const FONT_DEFS: Record<FontKey, FontDef> = {
  display: { family: 'Alpha7 Display', weight: 700, source: displayBold, approx: { advance: 0.48, cap: 0.8 } },
  ui: { family: 'Alpha7 UI', weight: 400, source: uiRegular, approx: { advance: 0.62, cap: 0.72 } },
  uiBold: { family: 'Alpha7 UI', weight: 700, source: uiBold, approx: { advance: 0.65, cap: 0.72 } },
};

/** Regras @font-face das fontes pedidas (só as usadas entram no SVG). */
export function fontFaceCss(keys: Iterable<FontKey>): string {
  return [...new Set(keys)]
    .sort()
    .map((key) => {
      const font = FONT_DEFS[key];
      return `@font-face{font-family:'${font.family}';font-weight:${font.weight};src:url(${font.source}) format('woff2');}`;
    })
    .join('');
}

let loading: Promise<void> | null = null;

/**
 * Registra as fontes no documento para o canvas medir o texto com as MESMAS fontes do desenho. Sem a API de fontes
 * (testes em jsdom), não faz nada: a medição aproximada assume.
 */
export function loadArtFonts(): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) return Promise.resolve();
  loading ??= Promise.all(
    (Object.keys(FONT_DEFS) as FontKey[]).map(async (key) => {
      const font = FONT_DEFS[key];
      const face = new FontFace(font.family, `url(${font.source}) format('woff2')`, { weight: String(font.weight) });
      document.fonts.add(await face.load());
    }),
  ).then(() => undefined);
  return loading.catch((error: unknown) => {
    loading = null;
    throw error;
  });
}
