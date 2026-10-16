import type { AthleteArt, CardArt, HighlightsArt, SpotlightArt } from '@/domain/arts';
import type { ArtCanvas } from '../canvas';
import { SLANT } from '../geometry';
import { H, M, W, backgroundPlane, bandText, fitText, footer, header, outlineNumber, photoSlot, placePhoto, tag, tone } from '../kit';

/** Apresentação do atleta: número em contorno, foto na área inclinada, nome e posição. */
export function drawAthlete(c: ArtCanvas, model: AthleteArt): void {
  const p = tone(model.tone);
  backgroundPlane(c, p, 640, 220);
  c.centerComposition(H);
  header(c, p, 210);
  outlineNumber(c, p, M, 680, String(model.player.number), 380);
  photoSlot(c, p, { x: 300, yBottom: 980, width: 720, height: 820 }, model.player.photo, model.framing, 'SEM FOTO CADASTRADA');
  const name = fitText(c, model.player.fullName.toUpperCase(), 'display', W - 2 * M, 190, { minSize: 60 });
  c.text(M, 1130, name.text, name.size, 'display', p.fg, { id: 'nome' });
  tag(c, p, M, 1206, 54, model.player.position.toUpperCase(), 26, 'posicao');
  footer(c, p);
  c.endComposition();
}

/** Destaque do atleta: fundamento ou motivo digitado, até três estatísticas digitadas (nunca inventadas). */
export function drawSpotlight(c: ArtCanvas, model: SpotlightArt): void {
  const p = tone(model.tone);
  backgroundPlane(c, p, 430, 300);
  c.centerComposition(H);
  c.logo(M, M, 210, p.logo);
  const band = { x: W - M - 480, y: 82, height: 96, span: 480 };
  c.band(band.x, band.y, band.height, band.span, p.invBg);
  bandText(c, band, 'DESTAQUE', 'display', p.invFg, 72, { pad: 40, letterSpacing: 3, id: 'titulo' });
  if (model.headline !== '') {
    const size = c.fit(model.headline.toUpperCase(), 'uiBold', 480, 26, 5, 16);
    c.text(W - M, band.y + band.height + 40, model.headline.toUpperCase(), size, 'uiBold', p.sub, { anchor: 'end', letterSpacing: 5, id: 'fundamento' });
  }
  photoSlot(c, p, { x: 320, yBottom: 860, width: 700, height: 590 }, model.player.photo, model.framing, 'SEM FOTO CADASTRADA');
  outlineNumber(c, p, M, 640, String(model.player.number), 380);
  const name = fitText(c, model.player.fullName.toUpperCase(), 'display', W - 2 * M, 150, { minSize: 56 });
  c.text(M, 1000, name.text, name.size, 'display', p.fg, { id: 'nome' });
  c.text(M, 1048, model.player.position.toUpperCase(), 26, 'uiBold', p.sub, { letterSpacing: 5, id: 'posicao' });

  const gap = 18;
  const cell = (W - 2 * M - 2 * gap) / 3;
  model.stats.forEach((stat, index) => {
    const x = M + index * (cell + gap);
    const fill = index === 0 ? p.invBg : p.plane2;
    const ink = index === 0 ? p.invFg : p.fg;
    const label = stat.label.toUpperCase();
    c.text(x + 8, 1112, label, c.fit(label, 'uiBold', cell - 16, 22, 3, 14), 'uiBold', p.sub, { letterSpacing: 3, id: `estatistica-rotulo-${index + 1}` });
    c.para(x, 1202, cell - 80 * SLANT, 80, fill);
    const value = fitText(c, stat.value, 'display', cell - 80 * SLANT - 30, 58, { minSize: 30 });
    c.text(x + cell / 2, 1202 - 40 + c.cap('display', value.size) / 2, value.text, value.size, 'display', ink, { anchor: 'middle', id: `estatistica-${index + 1}` });
  });
  footer(c, p);
  c.endComposition();
}

/** Capa de vídeo: compilado de lances de um atleta (4:5 no feed; no story a composição fica no miolo). */
export function drawHighlights(c: ArtCanvas, model: HighlightsArt): void {
  const p = tone(model.tone);
  backgroundPlane(c, p, 560, 300);
  c.centerComposition(H);
  header(c, p, 200, [model.detail]);
  photoSlot(c, p, { x: 300, yBottom: 720, width: 720, height: 530 }, model.player.photo, model.framing, 'SEM FOTO CADASTRADA');
  outlineNumber(c, p, M, 520, String(model.player.number), 320);

  // botão de play: bloco inclinado com triângulo
  c.para(M, 700, 150, 100, p.invBg);
  const cx = M + 75 + (100 * SLANT) / 2 + 4;
  c.polygon([[cx - 20, 620], [cx - 20, 680], [cx + 30, 650]], p.invFg);

  if (model.caption !== '') c.text(M, 790, model.caption.toUpperCase(), 40, 'uiBold', p.sub, { letterSpacing: 8, id: 'chamada' });
  const size = Math.min(c.fit(model.title.toUpperCase(), 'display', W - 2 * M, 330), 285);
  const cap = c.cap('display', size);
  const baseline = 790 + 30 + cap;
  c.text(M, baseline, model.title.toUpperCase(), size, 'display', p.fg, { id: 'titulo' });
  const name = fitText(c, model.player.fullName.toUpperCase(), 'display', W - 2 * M, 90, { minSize: 40 });
  c.text(M, baseline + 34 + c.cap('display', name.size), name.text, name.size, 'display', p.sub, { id: 'nome' });
  footer(c, p);
  c.endComposition();
}

/* ─────────────── carta do atleta ─────────────── */

/** A carta é a do app (silhueta com canto cortado, escudo de Overall, diagonais lilás): usa as cores dela, não as da arte. */
const CARD = {
  surface: '#211D29',
  surface3: '#37323F',
  purple800: '#381268',
  purple900: '#270949',
  lilac300: '#B9A6D0',
  lilac100: '#E4DCF0',
  text: '#F1EFF4',
  muted: '#B6AEC3',
  faint: '#A096B0',
};

const JERSEY_COLORS = {
  purple: { body: '#2f1058', trim: '#ffffff', number: '#ffffff' },
  white: { body: '#f6f3fa', trim: '#270949', number: '#270949' },
} as const;

/** Camisa ilustrativa do app (mesmo desenho do componente Jersey), no tamanho `size`. */
function jersey(c: ArtCanvas, x: number, y: number, size: number, model: CardArt): void {
  const color = JERSEY_COLORS[model.uniform];
  const scale = size / 120;
  const logo = model.uniform === 'white' ? 'purple' : 'white';
  c.raw(
    `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${scale.toFixed(4)})">` +
      `<path d="M38 6 20 14 4 36l18 10 8-8v66h60V38l8 8 18-10-16-22-18-8c-8 12-36 12-44 0Z" fill="${color.body}" stroke="${color.trim}" stroke-width="1" stroke-opacity="0.35"/>` +
      `<path d="M30 38v66M90 38v66" stroke="${color.trim}" stroke-width="4" stroke-linecap="round" fill="none"/>` +
      `<path d="M4 36l18 10M116 36l-18 10" stroke="${color.trim}" stroke-width="4" stroke-linecap="round" fill="none"/>` +
      `<path d="M38 6c8 12 36 12 44 0" fill="none" stroke="${color.trim}" stroke-width="4" stroke-linecap="round"/>` +
      '</g>',
  );
  const logoScale = scale * 20;
  c.logo(x + 64 * scale, y + 34 * scale, logoScale, logo);
  c.text(x + 60 * scale, y + 84 * scale, String(model.player.number), 40 * scale, 'display', color.number, { anchor: 'middle', check: false, id: 'camisa' });
}

export function drawCard(c: ArtCanvas, model: CardArt): void {
  const p = tone(model.tone);
  backgroundPlane(c, p, 640, 220);
  c.centerComposition(H);
  header(c, p, 150);

  const x0 = 160;
  const y0 = 205;
  const width = 760;
  const height = 1000;
  const cut = 72;
  const inner = 5;
  const outline = [
    [x0, y0],
    [x0 + width, y0],
    [x0 + width, y0 + height - cut],
    [x0 + width - cut, y0 + height],
    [x0, y0 + height],
  ] as const;
  c.polygon(outline, CARD.lilac300);
  const cutInner = cut - 2;
  c.polygon(
    [
      [x0 + inner, y0 + inner],
      [x0 + width - inner, y0 + inner],
      [x0 + width - inner, y0 + height - cutInner - inner],
      [x0 + width - cutInner - inner, y0 + height - inner],
      [x0 + inner, y0 + height - inner],
    ],
    CARD.surface,
  );

  // cabeçalho: faixas diagonais (roxo, lilás, grafite) com a foto ou a camisa por cima
  const hx = x0 + inner;
  const hy = y0 + inner;
  const hw = width - 2 * inner;
  const hh = 520;
  const headClip = c.nextId('cabecalho');
  c.clipPolygon(headClip, [[hx, hy], [hx + hw, hy], [hx + hw, hy + hh], [hx, hy + hh]]);
  const shift = hh * SLANT;
  const a = hx + hw * 0.1;
  const b = hx + hw * 0.52;
  c.raw(`<g clip-path="url(#${headClip})">`);
  c.rect(hx, hy, hw, hh, CARD.surface3);
  c.polygon([[hx - shift, hy], [a + shift, hy], [a, hy + hh], [hx - shift, hy + hh]], CARD.purple800);
  c.polygon([[a + shift, hy], [b + shift, hy], [b, hy + hh], [a, hy + hh]], CARD.lilac300);
  c.raw('</g>');
  if (model.player.photo) {
    placePhoto(c, headClip, { x: hx, y: hy, width: hw, height: hh }, model.player.photo, model.framing, false);
    const shade = c.nextId('sombra');
    c.addDef(`<linearGradient id="${shade}" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#17141D" stop-opacity="0.7"/><stop offset="1" stop-color="#17141D" stop-opacity="0"/></linearGradient>`);
    c.rect(hx, hy + hh * 0.55, hw, hh * 0.45, `url(#${shade})`);
  } else {
    jersey(c, x0 + width / 2 - 190 + 20, hy + hh - 360, 380, model);
  }

  // escudo de Overall (canto superior esquerdo) e traço do maior atributo (canto superior direito)
  const shield = c.nextId('escudo');
  c.addDef(`<linearGradient id="${shield}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#4c2088"/><stop offset="1" stop-color="#1d0638"/></linearGradient>`);
  const sx = hx + 22;
  const sy = hy + 22;
  const sk = 2.1;
  c.raw(
    `<g transform="translate(${sx},${sy}) scale(${sk})"><path d="M32 3 59 13v23c0 17-11 28-27 36C16 64 5 53 5 36V13Z" fill="url(#${shield})" stroke="${CARD.lilac300}" stroke-width="2.5" stroke-linejoin="round"/></g>`,
  );
  c.text(sx + 32 * sk, sy + 44 * sk, model.overall === null ? '—' : String(model.overall), 86, 'display', '#FFFFFF', { anchor: 'middle', id: 'overall', check: false });
  const traitText = model.trait ?? 'Sem avaliação';
  const traitSize = c.fit(traitText.toUpperCase(), 'uiBold', 330, 22, 2, 14);
  const traitInk = c.measure(traitText.toUpperCase(), 'uiBold', traitSize, 2);
  const traitWidth = traitInk.right - traitInk.left + 36;
  c.rect(hx + hw - traitWidth, hy, traitWidth, 46, model.trait ? CARD.purple900 : CARD.surface3);
  c.text(hx + hw - traitWidth + 18, hy + 31, traitText.toUpperCase(), traitSize, 'uiBold', model.trait ? CARD.lilac100 : CARD.muted, { letterSpacing: 2, id: 'traco' });

  // nome, número e posição
  const name = fitText(c, model.player.name.toUpperCase(), 'display', 520, 92, { minSize: 50 });
  const numberText = `#${model.player.number}`;
  const nameInk = c.measure(name.text, 'display', name.size, 0);
  const numberInk = c.measure(numberText, 'display', name.size, 0);
  const nameWidth = nameInk.right - nameInk.left;
  const total = nameWidth + 20 + (numberInk.right - numberInk.left);
  const left = x0 + width / 2 - total / 2;
  const baseline = hy + hh + 105;
  c.text(left, baseline, name.text, name.size, 'display', CARD.text, { id: 'nome' });
  c.text(left + nameWidth + 20, baseline, numberText, name.size, 'display', CARD.lilac300, { id: 'numero' });
  const position = [model.player.position, model.secondaryPosition].filter((part): part is string => part !== null).join('  ·  ');
  c.text(x0 + width / 2, baseline + 52, position, 30, 'ui', CARD.muted, { anchor: 'middle', id: 'posicao' });

  // seis atributos (nunca 0: sem avaliação, traço)
  const divider = baseline + 92;
  c.line(hx + 24, divider, hx + hw - 24, divider, 'rgba(255,255,255,0.12)', 2);
  const column = (hw - 48) / 3;
  model.attributes.forEach((attribute, index) => {
    const cx = hx + 24 + column * (index % 3) + column / 2;
    const row = Math.floor(index / 3);
    const top = divider + 44 + row * 118;
    c.text(cx, top, attribute.key, 24, 'uiBold', CARD.faint, { anchor: 'middle', letterSpacing: 2, id: `atributo-${attribute.key}`, check: false });
    c.text(cx, top + 62, attribute.value === null ? '—' : String(attribute.value), 66, 'display', CARD.text, { anchor: 'middle', id: `valor-${attribute.key}`, check: false });
  });
  footer(c, p);
  c.endComposition();
}
