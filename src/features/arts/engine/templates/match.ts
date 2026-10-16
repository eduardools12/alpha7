import type { ArtFraming, LineupArt, MatchdayArt, ResultArt } from '@/domain/arts';
import type { ArtCanvas } from '../canvas';
import { SLANT } from '../geometry';
import { H, M, W, backgroundPlane, bandInner, bandText, fitLines, fitText, footer, header, photoSlot, tone } from '../kit';

/** Dia de jogo: título grande, adversário em faixa e três campos (data, horário, local). */
export function drawMatchday(c: ArtCanvas, model: MatchdayArt): void {
  const p = tone(model.tone);
  backgroundPlane(c, p, 660, 280);
  c.centerComposition(H);
  header(c, p, 240, [model.competition, model.phase.toUpperCase()]);

  const size = Math.min(c.fit('DIA DE', 'display', W - 2 * M, 400), 280);
  const cap = c.cap('display', size);
  c.text(M, 310 + cap, 'DIA DE', size, 'display', p.fg, { id: 'titulo-1' });
  c.text(M, 310 + 2 * cap + 26, 'JOGO', size, 'display', p.fg, { id: 'titulo-2' });

  const band = { x: M, y: 310 + 2 * cap + 60, height: 130, span: W - 2 * M };
  c.band(band.x, band.y, band.height, band.span, p.invBg);
  c.inline(band.x, band.y, band.height, band.span, p.invFg, 12, 3);
  const versus = fitText(c, `ALPHA 7  ×  ${model.opponent.toUpperCase()}`, 'display', bandInner(band.height, band.span, 50), 110, { minSize: 44 });
  bandText(c, band, versus.text, 'display', p.invFg, versus.size, { pad: 50, id: 'confronto' });

  // três campos; o local ganha a coluna mais larga e pode quebrar em duas linhas (nome de ginásio costuma ser longo)
  const rowY = band.y + band.height + 62;
  const total = W - 2 * M;
  const widths = [0.36, 0.22, 0.42].map((share) => total * share);
  const fields: [string, string, string][] = [
    ['DATA', model.dateText, 'data'],
    ['HORÁRIO', model.timeText, 'horario'],
    ['LOCAL', model.venue.trim() === '' ? 'A DEFINIR' : model.venue.toUpperCase(), 'local'],
  ];
  let x = M;
  fields.forEach(([label, value, id], index) => {
    const columnWidth = widths[index] ?? 0;
    c.line(x, rowY - 34, x + columnWidth - 28, rowY - 34, p.line, 2);
    c.text(x, rowY, label, 24, 'uiBold', p.sub, { letterSpacing: 5, id: `rotulo-${id}` });
    const fitted = fitLines(c, value, 'display', columnWidth - 28, { maxSize: 76, minSize: 40, maxLines: id === 'local' ? 2 : 1 });
    fitted.lines.forEach((line, lineIndex) => {
      c.text(x, rowY + 84 + lineIndex * Math.round(fitted.size * 1.02), line, fitted.size, 'display', p.fg, { id: lineIndex === 0 ? id : `${id}-${lineIndex + 1}` });
    });
    x += columnWidth;
  });
  footer(c, p);
  c.endComposition();
}

/** Resultado: sets vencidos de cada equipe e os parciais de cada set (do placar real, nunca digitado). */
export function drawResult(c: ArtCanvas, model: ResultArt): void {
  const p = tone(model.tone);
  backgroundPlane(c, p, 700, 260);
  c.centerComposition(H);
  header(c, p, 200, ['RESULTADO FINAL', model.competition]);

  const span = W - 2 * M;
  const height = 230;
  const sides = [
    { name: 'ALPHA 7', fill: p.invBg, ink: p.invFg, sets: model.setsUs, divider: p.invFg, id: 'alpha7' },
    { name: model.opponent.toUpperCase(), fill: p.plane2, ink: p.fg, sets: model.setsThem, divider: p.sub, id: 'adversario' },
  ];
  let y = 300;
  for (const side of sides) {
    const band = { x: M, y, height, span };
    c.band(band.x, band.y, band.height, band.span, side.fill);
    const label = fitText(c, side.name, 'display', bandInner(height, span, 50) - 200, 130, { minSize: 34 });
    bandText(c, band, label.text, 'display', side.ink, label.size, { pad: 50, id: `equipe-${side.id}` });
    const dividerX = M + span - (height * SLANT) / 2 - 250;
    c.line(dividerX + (height * SLANT) / 2, y, dividerX - (height * SLANT) / 2, y + height, side.divider, 3);
    bandText(c, band, String(side.sets), 'display', side.ink, 190, { pad: 64, anchor: 'end', id: `sets-${side.id}` });
    y += height + 24;
  }

  if (model.sets.length > 0) {
    c.text(M, 888, 'PARCIAIS POR SET', 26, 'uiBold', p.sub, { letterSpacing: 6, id: 'parciais' });
    const gap = 14;
    const cell = (span - 4 * gap) / 5;
    model.sets.forEach((set, index) => {
      const x = M + index * (cell + gap);
      c.text(x + 8, 944, `SET ${set.number}`, 26, 'uiBold', p.fg, { letterSpacing: 3, id: `set-${set.number}` });
      [
        { value: set.us, fill: p.invBg, ink: p.invFg },
        { value: set.them, fill: p.plane2, ink: p.fg },
      ].forEach((row, line) => {
        const top = 972 + line * 106;
        c.para(x, top + 94, cell - 94 * SLANT, 94, row.fill);
        c.text(x + cell / 2, top + 47 + c.cap('display', 70) / 2, String(row.value), 70, 'display', row.ink, { anchor: 'middle', id: `parcial-${set.number}-${line + 1}` });
      });
    });
  }
  footer(c, p);
  c.endComposition();
}

/* ─────────────── escalação ─────────────── */

const TILE = { width: 130, height: 150 };
const CELL = (W - 2 * M) / 3;
const TILE_FRAMING: ArtFraming = { zoom: 1.6, x: 0.5, y: 0.06 };

/**
 * Escalação oficial: seis titulares na quadra (rede em cima: P4 P3 P2; fundo: P5 P6 P1), reservas e líbero.
 * Atleta com foto aparece na área inclinada (duotone roxo); sem foto, o número da camisa ocupa o lugar.
 */
export function drawLineup(c: ArtCanvas, model: LineupArt): void {
  const p = tone(model.tone);
  backgroundPlane(c, p, 560, 300);
  c.centerComposition(H);
  header(c, p, 200, [model.competition, model.dateText, model.venue]);

  c.text(M, 262, 'ESCALAÇÃO OFICIAL', 30, 'uiBold', p.sub, { letterSpacing: 8, id: 'titulo' });
  const band = { x: M, y: 282, height: 118, span: W - 2 * M };
  c.band(band.x, band.y, band.height, band.span, p.invBg);
  c.inline(band.x, band.y, band.height, band.span, p.invFg, 10, 3);
  const versus = fitText(c, `ALPHA 7  ×  ${model.opponent.toUpperCase()}`, 'display', bandInner(band.height, band.span, 50), 100, { minSize: 44 });
  bandText(c, band, versus.text, 'display', p.invFg, versus.size, { pad: 50, id: 'confronto' });

  // rede e linha de ataque
  c.line(M, 432, W - M, 432, p.fg, 10);
  c.line(M, 716, W - M, 716, p.plane2, 3, { 'stroke-dasharray': '14 12' });

  const rows = [466, 742];
  const slots = [
    { index: 3, column: 0, row: 0 },
    { index: 2, column: 1, row: 0 },
    { index: 1, column: 2, row: 0 },
    { index: 4, column: 0, row: 1 },
    { index: 5, column: 1, row: 1 },
    { index: 0, column: 2, row: 1 },
  ];
  for (const slot of slots) {
    const player = model.starters[slot.index];
    if (!player) continue;
    const x = M + slot.column * CELL;
    const bottom = (rows[slot.row] ?? 0) + TILE.height;
    if (player.photo) {
      photoSlot(c, p, { x, yBottom: bottom, width: TILE.width, height: TILE.height }, player.photo, TILE_FRAMING);
      c.para(x, bottom, 78, 46, p.invBg);
      c.text(x + 39 + (46 * SLANT) / 2, bottom - 23 + c.cap('display', 36) / 2, String(player.number), 36, 'display', p.invFg, { anchor: 'middle', id: `numero-p${slot.index + 1}` });
    } else {
      c.para(x, bottom, TILE.width, TILE.height, p.plane2);
      c.text(x + TILE.width / 2 + (TILE.height * SLANT) / 2, bottom - TILE.height / 2 + c.cap('display', 96) / 2, String(player.number), 96, 'display', p.fg, {
        anchor: 'middle',
        id: `numero-p${slot.index + 1}`,
      });
    }
    const name = fitText(c, player.name.toUpperCase(), 'display', CELL - 24, 46, { minSize: 26 });
    c.text(x, bottom + 44, name.text, name.size, 'display', p.fg, { id: `nome-p${slot.index + 1}` });
    const label = `${player.position.toUpperCase()} · P${slot.index + 1}`;
    c.text(x, bottom + 72, label, c.fit(label, 'uiBold', CELL - 24, 22, 3, 14), 'uiBold', p.sub, { letterSpacing: 3, id: `posicao-p${slot.index + 1}` });
  }

  // reservas e líbero
  const capacity = 9;
  const shown = model.reserves.slice(0, capacity);
  const hidden = model.reserves.length - shown.length;
  c.text(M, 1030, 'RESERVAS', 44, 'display', p.fg, { letterSpacing: 3, id: 'reservas' });
  if (hidden > 0) c.text(W - M, 1030, `+${hidden} RESERVAS`, 26, 'uiBold', p.sub, { anchor: 'end', letterSpacing: 3, id: 'reservas-mais' });
  c.line(M, 1044, W - M, 1044, p.line, 2);
  let last = 1084;
  if (shown.length === 0) {
    c.text(M, 1084, 'SEM RESERVAS NA ESCALAÇÃO', 24, 'uiBold', p.sub, { letterSpacing: 3, id: 'sem-reservas' });
  }
  shown.forEach((reserve, index) => {
    const x = M + (index % 3) * CELL;
    last = 1084 + Math.floor(index / 3) * 40;
    c.text(x, last, `#${reserve.number}`, 24, 'uiBold', p.sub, { id: `reserva-numero-${index + 1}` });
    const name = fitText(c, reserve.name.toUpperCase(), 'display', CELL - 90, 34, { minSize: 22 });
    c.text(x + 62, last, name.text, name.size, 'display', p.fg, { id: `reserva-${index + 1}` });
  });
  if (model.libero) {
    const base = last + 40;
    c.text(M, base, 'LÍBERO', 24, 'uiBold', p.sub, { letterSpacing: 3, id: 'libero-rotulo' });
    const name = fitText(c, `#${model.libero.number}  ${model.libero.name.toUpperCase()}`, 'display', W - 2 * M - 130, 34, { minSize: 22 });
    c.text(M + 130, base, name.text, name.size, 'display', p.fg, { id: 'libero' });
  }
  footer(c, p);
  c.endComposition();
}
