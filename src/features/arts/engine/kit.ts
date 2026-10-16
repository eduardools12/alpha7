import type { ArtFraming, ArtPhoto } from '@/domain/arts';
import { ArtCanvas } from './canvas';
import { SLANT, paraPoints } from './geometry';
import { COLOR, TONES, type TonePalette } from './palette';

/** Composição base: todas as artes são desenhadas em 1080 x 1350 (4:5); o story 9:16 a recebe no miolo. */
export const W = 1080;
export const H = 1350;
export const M = 72;

export const tone = (id: 'dark' | 'light'): TonePalette => TONES[id];

/** Plano diagonal tonal ao fundo (altura total do formato). */
export function backgroundPlane(c: ArtCanvas, p: TonePalette, x: number, width: number): void {
  c.para(x, c.height, width, c.height, p.plane);
}

/** Assinatura: três blocos inclinados em luminosidade crescente (recepção, levantamento, ataque). */
export function signature(c: ArtCanvas, p: TonePalette, xRight: number, yBase: number, height = 34, width = 44, gap = 12): void {
  const shift = height * SLANT;
  let x = xRight - (3 * (width + shift) + 2 * gap);
  for (const fill of [p.plane2, p.sub, p.fg]) {
    c.para(x, yBase, width, height, fill);
    x += width + shift + gap;
  }
}

/** Rodapé fixo: linha, rótulo da equipe e assinatura. */
export function footer(c: ArtCanvas, p: TonePalette, label = 'ALPHA 7  ·  VÔLEI'): void {
  c.line(M, 1236, W - M, 1236, p.line, 2);
  c.text(M, 1280, label, 26, 'uiBold', p.sub, { letterSpacing: 5, id: 'rodape' });
  signature(c, p, W - M, 1280);
}

/** Cabeçalho: logo no canto superior esquerdo e até três linhas de rótulo à direita (vazias não aparecem). */
export function header(c: ArtCanvas, p: TonePalette, logoWidth: number, labels: readonly string[] = []): void {
  c.logo(M, M, logoWidth, p.logo);
  labels
    .filter((label) => label !== '')
    .slice(0, 3)
    .forEach((label, index) => {
      const text = label.toUpperCase();
      const size = c.fit(text, 'uiBold', W - 2 * M - logoWidth - 40, 26, 5, 18);
      c.text(W - M, M + 34 + index * 38, text, size, 'uiBold', p.sub, { anchor: 'end', letterSpacing: 5, id: `rotulo-${index + 1}` });
    });
}

/** Texto dentro de uma faixa inclinada, centrado na vertical. */
export function bandText(
  c: ArtCanvas,
  band: { x: number; y: number; height: number; span: number },
  text: string,
  font: 'display' | 'ui' | 'uiBold',
  fill: string,
  size: number,
  options: { pad?: number; anchor?: 'start' | 'end'; letterSpacing?: number; id?: string } = {},
): void {
  const { pad = 40, anchor = 'start', letterSpacing = 0, id } = options;
  const shift = band.height * SLANT;
  const baseline = band.y + band.height / 2 + c.cap(font, size) / 2;
  const x = anchor === 'start' ? band.x + shift / 2 + pad : band.x + band.span - shift / 2 - pad;
  c.text(x, baseline, text, size, font, fill, { anchor, letterSpacing, ...(id ? { id } : {}) });
}

/** Largura útil do texto dentro de uma faixa (descontando a inclinação e o recuo dos dois lados). */
export const bandInner = (height: number, span: number, pad: number): number => span - height * SLANT - 2 * pad;

/* ─────────────── área de foto ─────────────── */

export interface PhotoSlot {
  /** Canto inferior esquerdo da base e medidas do paralelogramo (mesma convenção de `para`). */
  x: number;
  yBottom: number;
  width: number;
  height: number;
}

/** Retângulo que envolve o paralelogramo da foto. */
export const slotBox = (slot: PhotoSlot): { x: number; y: number; width: number; height: number } => ({
  x: slot.x,
  y: slot.yBottom - slot.height,
  width: slot.width + slot.height * SLANT,
  height: slot.height,
});

/** Posição e tamanho da imagem para preencher a caixa como "cover", com aproximação e posição dentro da sobra. */
export function coverPlacement(
  box: { x: number; y: number; width: number; height: number },
  photo: { width: number; height: number },
  framing: ArtFraming,
): { x: number; y: number; width: number; height: number } {
  const zoom = Math.min(3, Math.max(1, framing.zoom));
  const scale = Math.max(box.width / photo.width, box.height / photo.height) * zoom;
  const width = photo.width * scale;
  const height = photo.height * scale;
  const fx = Math.min(1, Math.max(0, framing.x));
  const fy = Math.min(1, Math.max(0, framing.y));
  return { x: box.x - fx * (width - box.width), y: box.y - fy * (height - box.height), width, height };
}

/**
 * Duotone roxo: a foto vira tons do Roxo profundo, do Lilás e do Branco. Unifica fotos feitas em luzes e ginásios
 * diferentes e tira da imagem cores que não são da marca. É filtro do próprio SVG (determinístico).
 */
function duotoneFilter(c: ArtCanvas): string {
  const id = c.nextId('duotone');
  const channel = (index: 1 | 3 | 5): string =>
    [COLOR.deep, COLOR.lilac, COLOR.white].map((hex) => (parseInt(hex.slice(index, index + 2), 16) / 255).toFixed(4)).join(' ');
  c.addDef(
    `<filter id="${id}" color-interpolation-filters="sRGB">` +
      '<feColorMatrix type="matrix" values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"/>' +
      '<feComponentTransfer>' +
      `<feFuncR type="table" tableValues="${channel(1)}"/>` +
      `<feFuncG type="table" tableValues="${channel(3)}"/>` +
      `<feFuncB type="table" tableValues="${channel(5)}"/>` +
      '</feComponentTransfer></filter>',
  );
  return id;
}

/**
 * Coloca a foto preenchendo `box` ("cover"), recortada pela máscara `clipId`. `duotone` aplica o filtro roxo; sem ele a
 * foto fica natural (a carta do atleta mostra a foto como no app).
 */
export function placePhoto(
  c: ArtCanvas,
  clipId: string,
  box: { x: number; y: number; width: number; height: number },
  photo: ArtPhoto,
  framing: ArtFraming,
  duotone: boolean,
): void {
  const known = photo.width && photo.height ? { width: photo.width, height: photo.height } : null;
  const place = known ? coverPlacement(box, known, framing) : box;
  const filter = duotone ? ` filter="url(#${duotoneFilter(c)})"` : '';
  c.raw(
    `<g clip-path="url(#${clipId})"><image id="foto" href="${photo.href}" x="${place.x.toFixed(1)}" y="${place.y.toFixed(1)}" width="${place.width.toFixed(1)}" height="${place.height.toFixed(1)}" preserveAspectRatio="${known ? 'none' : 'xMidYMin slice'}"${filter}/></g>`,
  );
}

/**
 * Área de foto inclinada. Com foto: a imagem preenche a máscara (duotone roxo). Sem foto: bloco de marcação com
 * hachura, que deixa claro onde a foto entra e nunca finge ser uma pessoa.
 */
export function photoSlot(c: ArtCanvas, p: TonePalette, slot: PhotoSlot, photo: ArtPhoto | undefined, framing: ArtFraming, label = 'SEM FOTO'): void {
  const points = paraPoints(slot.x, slot.yBottom, slot.width, slot.height);
  const clip = c.nextId('foto');
  c.clipPolygon(clip, points);
  if (photo) {
    placePhoto(c, clip, slotBox(slot), photo, framing, true);
    return;
  }
  c.polygon(points, p.slot);
  const lines: string[] = [];
  const shift = slot.height * SLANT;
  for (let x = slot.x - 40; x < slot.x + slot.width + shift + 40; x += 34) {
    lines.push(`<line x1="${x}" y1="${slot.yBottom}" x2="${(x + shift).toFixed(1)}" y2="${slot.yBottom - slot.height}" stroke="${p.slotLine}" stroke-width="2"/>`);
  }
  c.raw(`<g clip-path="url(#${clip})">${lines.join('')}</g>`);
  const centerX = Math.min(slot.x + slot.width / 2 + shift / 2, W - M - 130);
  c.text(centerX, slot.yBottom - slot.height / 2, label, 28, 'uiBold', p.sub, { anchor: 'middle', letterSpacing: 4, check: false });
}

/** Etiqueta inclinada (chip) com texto; devolve a largura total. */
export function tag(c: ArtCanvas, p: TonePalette, x: number, yBottom: number, height: number, text: string, size = 26, id?: string): number {
  const ink = c.measure(text, 'uiBold', size, 5);
  const textWidth = ink.right - ink.left;
  const width = textWidth + 52;
  c.para(x, yBottom, width, height, p.invBg);
  c.text(x + (height * SLANT) / 2 + 26, yBottom - height / 2 + c.cap('uiBold', size) / 2, text, size, 'uiBold', p.invFg, {
    letterSpacing: 5,
    ...(id ? { id } : {}),
  });
  return width + height * SLANT;
}

/** Número da camisa em contorno (sem preenchimento). */
export function outlineNumber(c: ArtCanvas, p: TonePalette, x: number, baseline: number, text: string, size: number): void {
  c.text(x, baseline, text, size, 'display', 'none', { stroke: p.fg, strokeWidth: 4, id: 'numero', check: false });
}

/**
 * Texto que sempre cabe: reduz o corpo até `minSize` e, se ainda passar da largura, corta com reticências. Devolve o
 * texto e o corpo a usar (nunca estoura a largura nem some).
 */
export function fitText(
  c: ArtCanvas,
  text: string,
  font: 'display' | 'ui' | 'uiBold',
  maxWidth: number,
  maxSize: number,
  options: { letterSpacing?: number; minSize?: number } = {},
): { text: string; size: number } {
  const { letterSpacing = 0, minSize = 30 } = options;
  const size = c.fit(text, font, maxWidth, maxSize, letterSpacing, minSize);
  const width = (value: string): number => {
    const ink = c.measure(value, font, size, letterSpacing);
    return ink.right - ink.left;
  };
  if (width(text) <= maxWidth) return { text, size };
  let cut = text;
  while (cut.length > 1 && width(`${cut}…`) > maxWidth) cut = cut.slice(0, -1);
  return { text: `${cut.trimEnd()}…`, size };
}

/**
 * Texto em até `maxLines` linhas: tenta o maior corpo (de `maxSize` a `minSize`, de 4 em 4) em que as palavras cabem
 * quebrando linha; no corpo mínimo, se ainda faltar espaço, a última linha termina com reticências.
 */
export function fitLines(
  c: ArtCanvas,
  text: string,
  font: 'display' | 'ui' | 'uiBold',
  maxWidth: number,
  options: { maxSize: number; minSize: number; maxLines: number },
): { lines: string[]; size: number } {
  const { maxSize, minSize, maxLines } = options;
  const width = (value: string, size: number): number => {
    const ink = c.measure(value, font, size, 0);
    return ink.right - ink.left;
  };
  const wrap = (size: number): string[] => {
    const lines: string[] = [];
    let current = '';
    for (const word of text.split(/\s+/).filter(Boolean)) {
      const attempt = current === '' ? word : `${current} ${word}`;
      if (current !== '' && width(attempt, size) > maxWidth) {
        lines.push(current);
        current = word;
      } else {
        current = attempt;
      }
    }
    if (current !== '') lines.push(current);
    return lines;
  };
  for (let size = maxSize; size >= minSize; size -= 4) {
    const lines = wrap(size);
    if (lines.length <= maxLines && lines.every((line) => width(line, size) <= maxWidth)) return { lines, size };
  }
  const lines = wrap(minSize);
  const kept = lines.slice(0, maxLines);
  if (lines.length > maxLines || kept.some((line) => width(line, minSize) > maxWidth)) {
    let last = kept[kept.length - 1] ?? '';
    while (last.length > 1 && width(`${last}…`, minSize) > maxWidth) last = last.slice(0, -1);
    kept[kept.length - 1] = `${last.trimEnd()}…`;
  }
  return { lines: kept, size: minSize };
}
