import type { ArtModel, ArtPlayer } from '@/domain/lineupArt';

/** Recursos embutidos no SVG (data URIs), para o PNG sair idêntico em qualquer máquina e sem pedir nada à rede. */
export interface ArtAssets {
  /** woff2 da Barlow Condensed 700, como data URI. */
  fontDataUri: string;
  /** Logo A7 oficial em branco (fundo roxo) e em roxo (fundo claro), como data URI. */
  logoWhite: string;
  logoPurple: string;
}

const PALETTE = {
  purple: '#270949',
  purpleDark: '#170429',
  violet: '#4c2088',
  lilac: '#b9a6d0',
  graphite: '#17141d',
  white: '#ffffff',
  mist: '#f1eff4',
} as const;

const xml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/** Tamanho de fonte que cabe: reduz textos longos para não passarem da largura. */
const fit = (text: string, base: number, maxChars: number): number => (text.length <= maxChars ? base : Math.max(base * 0.5, Math.round((base * maxChars) / text.length)));

/**
 * Desenha a arte como SVG (texto puro, determinístico: o mesmo modelo gera sempre o mesmo texto). A prévia da tela e
 * o PNG baixado usam ESTE mesmo SVG. Sem rostos nem imagens de referência: só o logo oficial, formas e texto.
 */
export function buildLineupArtSvg(model: ArtModel, assets: ArtAssets): string {
  const { width: W, height: H } = model.format;
  const light = model.uniform === 'white';
  const ink = light ? PALETTE.purple : PALETTE.white;
  const soft = light ? PALETTE.violet : PALETTE.lilac;
  const bgTop = light ? PALETTE.mist : PALETTE.purple;
  const bgBottom = light ? PALETTE.white : PALETTE.purpleDark;
  const discFill = light ? PALETTE.white : PALETTE.violet;
  const discStroke = light ? PALETTE.purple : PALETTE.lilac;
  const logo = light ? assets.logoPurple : assets.logoWhite;
  const tall = H > 1500;

  const headerY = tall ? 120 : 90;
  const logoH = 120;
  const logoW = Math.round(logoH * (640 / 457));
  const courtTop = tall ? 640 : 500;
  const courtH = tall ? 780 : 560;
  const courtLeft = 90;
  const courtW = W - 180;
  const colX = [courtLeft + courtW * 0.17, courtLeft + courtW * 0.5, courtLeft + courtW * 0.83];
  const rowY = [courtTop + courtH * 0.27, courtTop + courtH * 0.76];
  // Quadra vista de cima: rede em cima (P4 P3 P2), fundo embaixo (P5 P6 P1).
  const slots: { index: number; x: number; y: number }[] = [
    { index: 3, x: colX[0] ?? 0, y: rowY[0] ?? 0 },
    { index: 2, x: colX[1] ?? 0, y: rowY[0] ?? 0 },
    { index: 1, x: colX[2] ?? 0, y: rowY[0] ?? 0 },
    { index: 4, x: colX[0] ?? 0, y: rowY[1] ?? 0 },
    { index: 5, x: colX[1] ?? 0, y: rowY[1] ?? 0 },
    { index: 0, x: colX[2] ?? 0, y: rowY[1] ?? 0 },
  ];

  const player = (p: ArtPlayer | undefined, x: number, y: number, index: number): string => {
    if (!p) return '';
    return [
      `<g>`,
      `<circle cx="${x}" cy="${y}" r="62" fill="${discFill}" stroke="${discStroke}" stroke-width="5"/>`,
      `<text x="${x}" y="${y + 24}" text-anchor="middle" font-size="72" fill="${light ? PALETTE.purple : PALETTE.white}">${p.number}</text>`,
      `<text x="${x}" y="${y + 106}" text-anchor="middle" font-size="${fit(p.name, 40, 12)}" fill="${ink}">${xml(p.name.toUpperCase())}</text>`,
      `<text x="${x}" y="${y + 140}" text-anchor="middle" font-size="26" fill="${soft}">${xml(`${p.position} · P${index + 1}`.toUpperCase())}</text>`,
      `</g>`,
    ].join('');
  };

  const benchTop = courtTop + courtH + (tall ? 130 : 110);
  const reserveItems = model.reserves.slice(0, tall ? 14 : 10);
  const perRow = 2;
  const reserveRows = reserveItems
    .map((p, i) => {
      const col = i % perRow;
      const row = Math.floor(i / perRow);
      const x = courtLeft + col * (courtW / perRow);
      const y = benchTop + 56 + row * 52;
      return `<text x="${x}" y="${y}" font-size="34" fill="${ink}"><tspan fill="${soft}">#${p.number}</tspan> ${xml(p.name.toUpperCase())}</text>`;
    })
    .join('');
  const liberoY = benchTop + 56 + Math.ceil(reserveItems.length / perRow) * 52 + 16;
  const liberoLine = model.libero
    ? `<text x="${courtLeft}" y="${liberoY}" font-size="34" fill="${ink}"><tspan fill="${soft}">LÍBERO #${model.libero.number}</tspan> ${xml(model.libero.name.toUpperCase())}</text>`
    : '';

  const opponentLine = `ALPHA7 X ${model.opponent.toUpperCase()}`;
  const meta = [model.competition, model.dateText, model.venue].filter((part) => part !== '');

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Barlow Condensed','Arial Narrow',Impact,sans-serif" font-weight="700">`,
    `<defs>`,
    `<style>@font-face{font-family:'Barlow Condensed';font-weight:700;src:url(${assets.fontDataUri}) format('woff2');}</style>`,
    `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bgTop}"/><stop offset="1" stop-color="${bgBottom}"/></linearGradient>`,
    `</defs>`,
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>`,
    `<image href="${logo}" x="${courtLeft}" y="${headerY}" width="${logoW}" height="${logoH}"/>`,
    `<text x="${courtLeft + logoW + 28}" y="${headerY + 62}" font-size="64" fill="${ink}" letter-spacing="2">ALPHA7</text>`,
    `<text x="${courtLeft + logoW + 28}" y="${headerY + 104}" font-size="30" fill="${soft}" letter-spacing="4">VOLLEYBALL PERFORMANCE</text>`,
    `<text x="${courtLeft}" y="${headerY + logoH + 96}" font-size="104" fill="${ink}">${xml(model.title.toUpperCase())}</text>`,
    `<text x="${courtLeft}" y="${headerY + logoH + 160}" font-size="${fit(opponentLine, 56, 26)}" fill="${soft}">${xml(opponentLine)}</text>`,
    `<text x="${courtLeft}" y="${headerY + logoH + 212}" font-size="${fit(meta.join(' · '), 34, 48)}" fill="${ink}">${xml(meta.join(' · '))}</text>`,
    `<rect x="${courtLeft}" y="${courtTop}" width="${courtW}" height="${courtH}" rx="18" fill="none" stroke="${soft}" stroke-width="4"/>`,
    `<line x1="${courtLeft}" y1="${courtTop + courtH * 0.5}" x2="${courtLeft + courtW}" y2="${courtTop + courtH * 0.5}" stroke="${soft}" stroke-width="3" stroke-dasharray="14 12" opacity="0.7"/>`,
    `<line x1="${courtLeft}" y1="${courtTop}" x2="${courtLeft + courtW}" y2="${courtTop}" stroke="${ink}" stroke-width="10"/>`,
    ...slots.map((slot) => player(model.starters[slot.index], slot.x, slot.y, slot.index)),
    `<text x="${courtLeft}" y="${benchTop}" font-size="44" fill="${ink}" letter-spacing="3">RESERVAS</text>`,
    `<line x1="${courtLeft}" y1="${benchTop + 14}" x2="${courtLeft + courtW}" y2="${benchTop + 14}" stroke="${soft}" stroke-width="3"/>`,
    reserveItems.length === 0 ? `<text x="${courtLeft}" y="${benchTop + 62}" font-size="32" fill="${soft}">SEM RESERVAS NA ESCALAÇÃO</text>` : reserveRows,
    liberoLine,
    `<text x="${W / 2}" y="${H - 48}" text-anchor="middle" font-size="28" fill="${soft}" letter-spacing="5">ALPHA7 VOLLEYBALL PERFORMANCE</text>`,
    `</svg>`,
  ].join('');
}

/** Endereço do SVG para usar em <img> (prévia) e como origem do PNG. */
export const svgToDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

/**
 * Converte o SVG em PNG com o tamanho exato do formato, desenhando num canvas. Falha com mensagem clara se o
 * navegador não conseguir (nunca devolve um arquivo vazio).
 */
export async function svgToPng(svg: string, width: number, height: number): Promise<Blob> {
  const image = new Image();
  image.decoding = 'async';
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('O navegador não conseguiu desenhar a arte.'));
    image.src = svgToDataUrl(svg);
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Este navegador não consegue gerar a imagem.');
  context.drawImage(image, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível gerar o PNG.'))), 'image/png');
  });
}
