import type { BrandArt, CoverArt } from '@/domain/arts';
import type { ArtCanvas } from '../canvas';
import { SLANT, insetParaPoints, paraPoints } from '../geometry';
import { H, M, W, backgroundPlane, bandInner, bandText, footer, header, tone } from '../kit';
import { COLOR, mixWithWhite } from '../palette';

/** Apresentação da equipe: nome, posicionamento e os cinco atributos do sistema visual. */
function presentation(c: ArtCanvas, model: BrandArt): void {
  const p = tone(model.tone);
  backgroundPlane(c, p, 560, 300);
  c.centerComposition(H);
  header(c, p, 300, ['EQUIPE DE VÔLEI', 'COMPETITIVA']);

  const span = W - 2 * M;
  const band = { x: M, y: 440, height: 310, span };
  c.band(band.x, band.y, band.height, span, p.invBg);
  c.inline(band.x, band.y, band.height, span, p.invFg, 14, 3);
  const size = Math.min(c.fit('ALPHA 7', 'display', bandInner(band.height, span, 52), 460), Math.floor((band.height * 0.8) / 0.8));
  bandText(c, band, 'ALPHA 7', 'display', p.invFg, size, { pad: 52, id: 'titulo' });

  const second = { x: M + 56, y: band.y + band.height + 22, height: 96, span: span - 56 };
  c.band(second.x, second.y, second.height, second.span, p.plane2);
  bandText(c, second, 'VÔLEI COMPETITIVO', 'display', p.fg, 64, { pad: 44, letterSpacing: 6, id: 'posicionamento' });

  ['COMPETIÇÃO', 'DISCIPLINA', 'PRECISÃO', 'UNIDADE', 'EVOLUÇÃO'].forEach((item, index) => {
    const y = 960 + index * 54;
    c.line(M, y, M + 500, y, p.line, 2);
    c.text(M, y + 40, `0${index + 1}`, 36, 'display', p.sub, { id: `n${index}` });
    c.text(M + 78, y + 40, item, 30, 'uiBold', p.fg, { letterSpacing: 4, id: item });
  });
  footer(c, p);
  c.endComposition();
}

/** Manifesto: os três toques do vôlei em três faixas escalonadas. */
function manifesto(c: ArtCanvas, model: BrandArt): void {
  const p = tone(model.tone);
  c.para(-120, c.height, 330, c.height, p.plane);
  c.centerComposition(H);
  header(c, p, 200, ['MANIFESTO']);

  const words = ['RECEPÇÃO', 'LEVANTAMENTO', 'ATAQUE'];
  const fills = [p.plane2, p.sub, p.invBg];
  const inks = [p.fg, p.invFg, p.invFg];
  const height = 160;
  const span = W - 2 * M;
  const size = c.fit('LEVANTAMENTO', 'display', span - 128 - height * SLANT - 240, 300);
  let y = 270;
  words.forEach((word, index) => {
    const band = { x: M + index * 60, y, height, span: span - index * 60 };
    c.band(band.x, band.y, band.height, band.span, fills[index] ?? p.plane2);
    bandText(c, band, word, 'display', inks[index] ?? p.fg, size, { pad: 44, id: word });
    bandText(c, band, `0${index + 1}`, 'display', inks[index] ?? p.fg, 70, { pad: 44, anchor: 'end', id: `num${index + 1}` });
    y += height + 18;
  });
  const phrase = c.fit('TRÊS TOQUES.', 'display', W - 2 * M, 180);
  const cap = c.cap('display', phrase);
  const first = y + 40 + cap;
  c.text(M, first, 'TRÊS TOQUES.', phrase, 'display', p.fg, { id: 'frase-1' });
  c.text(M, first + cap + 52, 'UM SÓ TIME.', phrase, 'display', p.sub, { id: 'frase-2' });
  footer(c, p);
  c.endComposition();
}

/** Identidade: palavras-chave em rampa de tom, do claro ao sólido (evolução). */
function identity(c: ArtCanvas, model: BrandArt): void {
  const p = tone(model.tone);
  c.para(600, c.height, 250, c.height, p.plane);
  c.centerComposition(H);
  header(c, p, 220, ['IDENTIDADE']);
  const light = model.tone === 'light';
  const words: [string, string][] = [
    ['UNIDADE', light ? mixWithWhite(0.5) : COLOR.purple40],
    ['PRECISÃO', light ? mixWithWhite(0.26) : COLOR.lilac],
    ['EVOLUÇÃO', light ? COLOR.purple : COLOR.white],
  ];
  let y = 330;
  for (const [word, fill] of words) {
    const size = c.fit(word, 'display', W - 2 * M, 400);
    const cap = c.cap('display', size);
    c.text(M, y + cap, word, size, 'display', fill, { id: word });
    y += cap + 52;
  }
  footer(c, p);
  c.endComposition();
}

export function drawBrand(c: ArtCanvas, model: BrandArt): void {
  if (model.variant === 'apresentacao') presentation(c, model);
  else if (model.variant === 'manifesto') manifesto(c, model);
  else identity(c, model);
}

/* ─────────────── capas dos destaques (1080 x 1080) ─────────────── */

const STROKE = 24;

export function drawCover(c: ArtCanvas, model: CoverArt): void {
  const p = tone(model.tone);
  c.para(520, c.height, 260, c.height, p.plane);
  const ink = p.fg;
  const middle = 540;
  switch (model.variant) {
    case 'equipe': {
      // três degraus, os três toques: dois em contorno e o último sólido
      const heights = [230, 310, 390] as const;
      const width = 110;
      const step = 170;
      const total = 2 * step + width + 390 * SLANT;
      const left = middle - total / 2;
      const base = middle + 390 / 2;
      heights.forEach((height, index) => {
        const x = left + index * step;
        if (index === 2) c.para(x, base, width, height, ink);
        else c.outline(insetParaPoints(x, base, width, height, 11), ink, 22);
      });
      break;
    }
    case 'atletas': {
      // camisa com o friso inclinado dos uniformes
      const k = 1.2;
      const top = middle - ((190 - 150) * k) / 2;
      const shape: [number, number][] = [
        [-110, -150], [-45, -150], [-30, -128], [30, -128], [45, -150], [110, -150], [212, -64],
        [160, 16], [110, -26], [110, 190], [-110, 190], [-110, -26], [-160, 16], [-212, -64],
      ];
      c.outline(shape.map(([x, y]) => [middle + x * k, top + y * k] as const), ink, STROKE);
      c.para(middle - 60, top + 190 * k - 12, 70, 330, ink);
      break;
    }
    case 'jogos': {
      // bola: círculo com três costuras curvas
      const radius = 215;
      c.circle(middle, middle, radius, 'none', { stroke: ink, 'stroke-width': STROKE });
      for (const angle of [-90, 30, 150]) {
        const a0 = (angle * Math.PI) / 180;
        const a1 = ((angle + 100) * Math.PI) / 180;
        const am = ((angle + 50) * Math.PI) / 180;
        const x0 = middle + radius * Math.cos(a0);
        const y0 = middle + radius * Math.sin(a0);
        const x1 = middle + radius * Math.cos(a1);
        const y1 = middle + radius * Math.sin(a1);
        const qx = middle + radius * 0.22 * Math.cos(am);
        const qy = middle + radius * 0.22 * Math.sin(am);
        c.path(`M${x0.toFixed(1)},${y0.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`, 'none', { stroke: ink, 'stroke-width': STROKE });
      }
      break;
    }
    case 'resultados': {
      // placar: contorno com a metade vencedora preenchida
      const height = 250;
      const width = 380;
      const left = middle - (width + height * SLANT) / 2;
      const base = middle + height / 2;
      c.outline(insetParaPoints(left, base, width, height, 12), ink, STROKE);
      c.polygon(paraPoints(left, base, width / 2 - 20, height), ink);
      break;
    }
    case 'bastidores': {
      // visor: quatro cantos e o ponto de gravação
      const reach = 230;
      const arm = 110;
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
        const px = middle + sx * reach;
        const py = middle + sy * reach;
        c.path(`M${(px - sx * arm).toFixed(1)},${py.toFixed(1)} L${px.toFixed(1)},${py.toFixed(1)} L${px.toFixed(1)},${(py - sy * arm).toFixed(1)}`, 'none', { stroke: ink, 'stroke-width': STROKE });
      }
      c.circle(middle, middle, 62, ink);
      break;
    }
  }
}
