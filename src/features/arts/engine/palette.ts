/**
 * Cores das artes. Paleta de base informada pela equipe (roxo #270949, branco, cinza-lilás, roxo profundo) e tons de
 * apoio DERIVADOS do roxo (mistura com branco). As artes são SVG e não leem CSS, então as cores ficam aqui.
 * Sem preto e sem dourado.
 */

import type { ArtTone } from '@/domain/arts';

const hex = (value: number): string => Math.round(value).toString(16).padStart(2, '0').toUpperCase();

const PURPLE_RGB = [39, 9, 73] as const;

/** Mistura o roxo com branco: 0 = roxo puro, 1 = branco. */
export function mixWithWhite(amount: number): string {
  const [r, g, b] = PURPLE_RGB;
  return `#${hex(r + (255 - r) * amount)}${hex(g + (255 - g) * amount)}${hex(b + (255 - b) * amount)}`;
}

export const COLOR = {
  /** Paleta da equipe. */
  purple: '#270949',
  white: '#FFFFFF',
  mist: '#F0EDF4',
  deep: '#160623',
  /** Tons de apoio derivados do Roxo Alpha. */
  purple2: mixWithWhite(0.1),
  purple3: mixWithWhite(0.22),
  lilac: mixWithWhite(0.6),
  lilac2: mixWithWhite(0.8),
  purple40: mixWithWhite(0.4),
} as const;

export interface TonePalette {
  bg: string;
  /** Texto principal. */
  fg: string;
  /** Texto de apoio. */
  sub: string;
  /** Plano tonal ao fundo e faixas secundárias. */
  plane: string;
  plane2: string;
  /** Faixa invertida: fundo e texto. */
  invBg: string;
  invFg: string;
  /** Fios e linhas. */
  line: string;
  /** Qual versão da logo entra sobre este fundo. */
  logo: 'white' | 'purple';
  /** Área de foto vazia. */
  slot: string;
  slotLine: string;
}

export const TONES: Record<ArtTone, TonePalette> = {
  dark: {
    bg: COLOR.purple,
    fg: COLOR.white,
    sub: COLOR.lilac,
    plane: COLOR.purple2,
    plane2: COLOR.purple3,
    invBg: COLOR.white,
    invFg: COLOR.purple,
    line: COLOR.purple3,
    logo: 'white',
    slot: COLOR.deep,
    slotLine: COLOR.purple2,
  },
  light: {
    bg: COLOR.white,
    fg: COLOR.purple,
    sub: COLOR.purple40,
    plane: COLOR.mist,
    plane2: mixWithWhite(0.86),
    invBg: COLOR.purple,
    invFg: COLOR.white,
    line: COLOR.lilac2,
    logo: 'purple',
    slot: mixWithWhite(0.88),
    slotLine: mixWithWhite(0.72),
  },
};
