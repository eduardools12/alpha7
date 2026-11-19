import { FONT_DEFS, fontFaceCss, type FontKey } from './fonts';
import { bandSpan, insetParaPoints, paraPoints, pointsAttr, type Point } from './geometry';
import type { Measure } from './measure';
import { capHeight } from './measure';
import type { TonePalette } from './palette';

/** Recursos embutidos no SVG como data URI: a logo oficial (derivada, PNG com transparência) nas duas cores. */
export interface ArtAssets {
  logoWhite: string;
  logoPurple: string;
}

/** Proporção do arquivo da logo (public/brand/a7-mark-art-*.png, 760 x 545). Nunca se distorce. */
export const LOGO_RATIO = 545 / 760;

export interface TextBox {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface TextOptions {
  anchor?: 'start' | 'middle' | 'end';
  letterSpacing?: number;
  id?: string;
  stroke?: string;
  strokeWidth?: number;
  /** false = não entra nas conferências de margem e de sobreposição (texto de apoio que pode encostar). */
  check?: boolean;
}

export const xmlEscape = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Número curto e estável para o SVG (o mesmo desenho gera sempre o mesmo texto). */
const num = (value: number): string => String(Math.round(value * 100) / 100);

type Attrs = Record<string, string | number | undefined>;

const attrs = (values: Attrs | undefined): string =>
  values
    ? Object.entries(values)
        .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
        .map(([key, value]) => ` ${key}="${typeof value === 'number' ? num(value) : xmlEscape(value)}"`)
        .join('')
    : '';

export interface CanvasInit {
  width: number;
  height: number;
  background: string;
  title: string;
  measure: Measure;
  assets: ArtAssets;
  /** Margem de segurança lateral (px). */
  margin?: number;
}

/**
 * Construtor de SVG das artes. Texto vivo, formas, logo e fotos embutidas; sem IA, sem imagem externa. Mede cada texto
 * (com a mesma fonte do desenho) para conferir margens e sobreposições (`warnings`).
 */
export class ArtCanvas {
  readonly width: number;
  readonly height: number;
  readonly margin: number;
  readonly measure: Measure;
  private readonly background: string;
  private readonly title: string;
  private readonly assets: ArtAssets;
  private readonly parts: string[] = [];
  private readonly defs: string[] = [];
  private readonly fontsUsed = new Set<FontKey>();
  private readonly boxes: TextBox[] = [];
  private readonly logos: { left: number; top: number; right: number; bottom: number }[] = [];
  private counter = 0;
  /** Área de composição em coordenadas locais (o desenho é feito em 1080 x 1350 e centralizado em formatos mais altos). */
  private localHeight: number;

  constructor(init: CanvasInit) {
    this.width = init.width;
    this.height = init.height;
    this.margin = init.margin ?? 72;
    this.measure = init.measure;
    this.background = init.background;
    this.title = init.title;
    this.assets = init.assets;
    this.localHeight = init.height;
  }

  nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}-${this.counter}`;
  }

  /** Abre um grupo que desloca a composição para o miolo da tela (story 9:16 usa a composição 4:5 no centro). */
  centerComposition(localHeight: number): void {
    this.localHeight = localHeight;
    const dy = (this.height - localHeight) / 2;
    if (dy !== 0) this.parts.push(`<g transform="translate(0,${num(dy)})">`);
  }

  endComposition(): void {
    if (this.height !== this.localHeight) this.parts.push('</g>');
  }

  raw(markup: string): void {
    this.parts.push(markup);
  }

  addDef(markup: string): void {
    this.defs.push(markup);
  }

  rect(x: number, y: number, width: number, height: number, fill: string, extra?: Attrs): void {
    this.parts.push(`<rect x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}" fill="${fill}"${attrs(extra)}/>`);
  }

  polygon(points: readonly Point[], fill: string, extra?: Attrs): void {
    this.parts.push(`<polygon points="${pointsAttr(points)}" fill="${fill}"${attrs(extra)}/>`);
  }

  /** Contorno (sem preenchimento) de uma lista de pontos. */
  outline(points: readonly Point[], stroke: string, strokeWidth: number): void {
    this.parts.push(`<polygon points="${pointsAttr(points)}" fill="none" stroke="${stroke}" stroke-width="${num(strokeWidth)}" stroke-linejoin="miter"/>`);
  }

  /** Paralelogramo inclinado a 26°. (x, yBottom) = canto inferior esquerdo. */
  para(x: number, yBottom: number, width: number, height: number, fill: string, extra?: Attrs): Point[] {
    const points = paraPoints(x, yBottom, width, height);
    this.polygon(points, fill, extra);
    return points;
  }

  /** Faixa horizontal inclinada: (x, y) = canto superior esquerdo do retângulo envolvente; `span` = largura total. */
  band(x: number, y: number, height: number, span: number, fill: string, extra?: Attrs): Point[] {
    return this.para(x, y + height, span - bandSpan(0, height), height, fill, extra);
  }

  /** Linha interna (fio) recuada dentro de uma faixa. */
  inline(x: number, y: number, height: number, span: number, stroke: string, inset = 12, strokeWidth = 3): void {
    this.outline(insetParaPoints(x, y + height, span - bandSpan(0, height), height, inset), stroke, strokeWidth);
  }

  line(x1: number, y1: number, x2: number, y2: number, stroke: string, strokeWidth: number, extra?: Attrs): void {
    this.parts.push(`<line x1="${num(x1)}" y1="${num(y1)}" x2="${num(x2)}" y2="${num(y2)}" stroke="${stroke}" stroke-width="${num(strokeWidth)}"${attrs(extra)}/>`);
  }

  path(d: string, fill: string, extra?: Attrs): void {
    this.parts.push(`<path d="${d}" fill="${fill}"${attrs(extra)}/>`);
  }

  circle(cx: number, cy: number, r: number, fill: string, extra?: Attrs): void {
    this.parts.push(`<circle cx="${num(cx)}" cy="${num(cy)}" r="${num(r)}" fill="${fill}"${attrs(extra)}/>`);
  }

  clipPolygon(id: string, points: readonly Point[]): void {
    this.defs.push(`<clipPath id="${id}"><polygon points="${pointsAttr(points)}"/></clipPath>`);
  }

  /** Logo oficial (PNG derivado, com transparência). Sem alterar proporção. Devolve a altura. */
  logo(x: number, y: number, width: number, tone: TonePalette['logo']): number {
    const height = width * LOGO_RATIO;
    const href = tone === 'white' ? this.assets.logoWhite : this.assets.logoPurple;
    this.parts.push(`<image href="${href}" x="${num(x)}" y="${num(y)}" width="${num(width)}" height="${num(height)}"/>`);
    this.logos.push({ left: x, top: y, right: x + width, bottom: y + height });
    return height;
  }

  /** Maior corpo (até `maxSize`) em que o texto cabe em `maxWidth`. */
  fit(text: string, font: FontKey, maxWidth: number, maxSize: number, letterSpacing = 0, minSize = 10): number {
    let size = maxSize;
    while (size > minSize) {
      const box = this.measure(text, font, size, letterSpacing);
      if (box.right - box.left <= maxWidth) return size;
      size -= 1;
    }
    return minSize;
  }

  cap(font: FontKey, size: number): number {
    return capHeight(font, size);
  }

  /** Texto vivo. `baseline` é a linha de base. Devolve a caixa de tinta. */
  text(x: number, baseline: number, text: string, size: number, font: FontKey, fill: string, options: TextOptions = {}): TextBox {
    const { anchor = 'start', letterSpacing = 0, id, stroke, strokeWidth = 0, check = true } = options;
    const def = FONT_DEFS[font];
    this.fontsUsed.add(font);
    const ink = this.measure(text, font, size, letterSpacing);
    // Onde o texto começa (origem) para que a tinta termine em x (anchor end) ou fique centrada em x (middle).
    const origin = anchor === 'start' ? x : anchor === 'end' ? x - ink.right : x - (ink.left + ink.right) / 2;
    const box: TextBox = { id: id ?? text.slice(0, 24), left: origin + ink.left, top: baseline + ink.top, right: origin + ink.right, bottom: baseline + ink.bottom };
    if (check) this.boxes.push(box);
    const anchorAttr = anchor === 'start' ? '' : ` text-anchor="${anchor}"`;
    const spacing = letterSpacing ? ` letter-spacing="${num(letterSpacing)}"` : '';
    const strokeAttr = stroke ? ` stroke="${stroke}" stroke-width="${num(strokeWidth)}" stroke-linejoin="round" paint-order="stroke"` : '';
    const idAttr = id ? ` id="${xmlEscape(id)}"` : '';
    this.parts.push(
      `<text${idAttr} x="${num(x)}" y="${num(baseline)}" font-family="'${def.family}','Arial Narrow',Arial,sans-serif" font-weight="${def.weight}" font-size="${num(size)}" fill="${fill}"${anchorAttr}${spacing}${strokeAttr}>${xmlEscape(text)}</text>`,
    );
    return box;
  }

  /** Avisos de composição: texto fora da margem lateral, cortado ou sobreposto a outro texto. Lista vazia = tudo em ordem. */
  warnings(): string[] {
    const found: string[] = [];
    for (const box of this.boxes) {
      if (box.left < 0 || box.top < 0 || box.right > this.width || box.bottom > this.localHeight) found.push(`Cortado: ${box.id}`);
      else if (box.left < this.margin - 1 || box.right > this.width - this.margin + 1) found.push(`Fora da margem lateral: ${box.id}`);
    }
    for (let i = 0; i < this.boxes.length; i += 1) {
      for (let j = i + 1; j < this.boxes.length; j += 1) {
        const a = this.boxes[i];
        const b = this.boxes[j];
        if (!a || !b) continue;
        const overlapX = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapY = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapX > 1 && overlapY > 1) found.push(`Sobreposição: ${a.id} e ${b.id}`);
      }
    }
    for (const logo of this.logos) {
      if (logo.left < 0 || logo.top < 0 || logo.right > this.width || logo.bottom > this.localHeight) found.push('Logo cortada');
    }
    return found;
  }

  /** Caixas de texto medidas (para testes de layout). */
  textBoxes(): readonly TextBox[] {
    return this.boxes;
  }

  svg(): string {
    const css = fontFaceCss(this.fontsUsed);
    const defs = `<defs>${css ? `<style>${css}</style>` : ''}${this.defs.join('')}</defs>`;
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}">`,
      `<title>${xmlEscape(this.title)}</title>`,
      defs,
      `<rect width="${this.width}" height="${this.height}" fill="${this.background}"/>`,
      ...this.parts,
      '</svg>',
    ].join('');
  }
}
