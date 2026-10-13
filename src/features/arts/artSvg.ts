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

const LOGO_RATIO = 640 / 457;

/** Medidas da arte (em pixels do formato). Separadas do desenho para poderem ser conferidas por teste: nada se sobrepõe. */
export interface ArtLayout {
  width: number;
  height: number;
  margin: number;
  headerY: number;
  logoHeight: number;
  logoWidth: number;
  /** Topo (rede) e altura da quadra. */
  courtTop: number;
  courtHeight: number;
  /** Escala dos jogadores (maior no formato story). */
  scale: number;
  discRadius: number;
  /** Centro dos discos: fileira da rede (P4 P3 P2) e fileira do fundo (P5 P6 P1). */
  rowY: [number, number];
  colX: [number, number, number];
  /** Linha dos três metros, entre as duas fileiras (nunca cruza nomes). */
  attackLineY: number;
  benchTop: number;
  reserveColumns: number;
  reserveRowHeight: number;
  /** Quantas reservas cabem; as demais viram "+N". */
  reserveCapacity: number;
  reserveFirstBaseline: number;
  liberoBaseline: number | null;
  /** Base do último texto de conteúdo e linha de base do rodapé. */
  contentBottom: number;
  footerBaseline: number;
}

export function artLayout(model: ArtModel): ArtLayout {
  const { width, height } = model.format;
  const tall = height > 1500;
  const scale = tall ? 1.3 : 1;
  const margin = 90;
  const headerY = tall ? 120 : 80;
  const logoHeight = 120;
  const courtTop = headerY + logoHeight + 222 + (tall ? 70 : 50);
  const discRadius = Math.round(64 * scale);
  const below = Math.round(152 * scale); // da base do disco ao último texto do jogador
  const rowOne = courtTop + Math.round(92 * scale);
  const rowTwo = rowOne + discRadius + below + Math.round(46 * scale);
  const courtHeight = rowTwo - courtTop + below + Math.round(30 * scale);
  const courtW = width - margin * 2;
  const benchTop = courtTop + courtHeight + (tall ? 72 : 56);
  const reserveColumns = 3;
  const reserveRowHeight = tall ? 54 : 42;
  const reserveCapacity = tall ? 15 : 9;
  const shown = Math.min(model.reserves.length, reserveCapacity);
  const rows = Math.max(1, Math.ceil(shown / reserveColumns));
  const reserveFirstBaseline = benchTop + 56;
  const lastReserve = reserveFirstBaseline + (rows - 1) * reserveRowHeight;
  const liberoBaseline = model.libero ? lastReserve + reserveRowHeight + 6 : null;
  const contentBottom = (liberoBaseline ?? lastReserve) + 10;
  return {
    width,
    height,
    margin,
    headerY,
    logoHeight,
    logoWidth: Math.round(logoHeight * LOGO_RATIO),
    courtTop,
    courtHeight,
    scale,
    discRadius,
    rowY: [rowOne, rowTwo],
    colX: [margin + courtW * 0.17, margin + courtW * 0.5, margin + courtW * 0.83],
    attackLineY: Math.round((rowOne + below + (rowTwo - discRadius)) / 2),
    benchTop,
    reserveColumns,
    reserveRowHeight,
    reserveCapacity,
    reserveFirstBaseline,
    liberoBaseline,
    contentBottom,
    footerBaseline: height - 44,
  };
}

/**
 * Desenha a arte como SVG (texto puro, determinístico: o mesmo modelo gera sempre o mesmo texto). A prévia da tela e
 * o PNG baixado usam ESTE mesmo SVG. Só entram: o logo oficial, formas, texto e as fotos cadastradas dos atletas
 * (data URIs): sem IA e sem imagem de referência. Atleta sem foto aparece com o número da camisa.
 */
export function buildLineupArtSvg(model: ArtModel, assets: ArtAssets): string {
  const L = artLayout(model);
  const { width: W, height: H } = L;
  const light = model.uniform === 'white';
  const ink = light ? PALETTE.purple : PALETTE.white;
  const soft = light ? PALETTE.violet : PALETTE.lilac;
  const bgTop = light ? PALETTE.mist : PALETTE.purple;
  const bgBottom = light ? PALETTE.white : PALETTE.purpleDark;
  const discFill = light ? PALETTE.white : PALETTE.violet;
  const discStroke = light ? PALETTE.purple : PALETTE.lilac;
  const logo = light ? assets.logoPurple : assets.logoWhite;
  const courtLeft = L.margin;
  const courtW = W - L.margin * 2;
  const s = L.scale;
  const r = L.discRadius;

  // Quadra vista de cima: rede em cima (P4 P3 P2), fundo embaixo (P5 P6 P1).
  const slots: { index: number; x: number; y: number }[] = [
    { index: 3, x: L.colX[0], y: L.rowY[0] },
    { index: 2, x: L.colX[1], y: L.rowY[0] },
    { index: 1, x: L.colX[2], y: L.rowY[0] },
    { index: 4, x: L.colX[0], y: L.rowY[1] },
    { index: 5, x: L.colX[1], y: L.rowY[1] },
    { index: 0, x: L.colX[2], y: L.rowY[1] },
  ];

  const clips: string[] = [];
  const player = (p: ArtPlayer | undefined, x: number, y: number, index: number): string => {
    if (!p) return '';
    const numberFill = light ? PALETTE.purple : PALETTE.white;
    const parts: string[] = [`<g>`];
    if (p.photo) {
      const id = `clip-${index}`;
      clips.push(`<clipPath id="${id}"><circle cx="${x}" cy="${y}" r="${r}"/></clipPath>`);
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${discFill}"/>`,
        // A foto preenche o círculo mantendo a proporção; âncora no alto (rosto).
        `<image href="${p.photo}" x="${x - r}" y="${y - r}" width="${r * 2}" height="${r * 2}" preserveAspectRatio="xMidYMin slice" clip-path="url(#${id})"/>`,
        `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${discStroke}" stroke-width="${Math.round(5 * s)}"/>`,
        `<circle cx="${x + r * 0.74}" cy="${y + r * 0.74}" r="${Math.round(26 * s)}" fill="${PALETTE.purple}" stroke="${discStroke}" stroke-width="3"/>`,
        `<text x="${x + r * 0.74}" y="${y + r * 0.74 + Math.round(11 * s)}" text-anchor="middle" font-size="${Math.round(32 * s)}" fill="${PALETTE.white}">${p.number}</text>`,
      );
    } else {
      parts.push(
        `<circle cx="${x}" cy="${y}" r="${r}" fill="${discFill}" stroke="${discStroke}" stroke-width="${Math.round(5 * s)}"/>`,
        `<text x="${x}" y="${y + Math.round(24 * s)}" text-anchor="middle" font-size="${Math.round(72 * s)}" fill="${numberFill}">${p.number}</text>`,
      );
    }
    parts.push(
      `<text x="${x}" y="${y + r + Math.round(46 * s)}" text-anchor="middle" font-size="${fit(p.name, Math.round(40 * s), 12)}" fill="${ink}">${xml(p.name.toUpperCase())}</text>`,
      `<text x="${x}" y="${y + r + Math.round(80 * s)}" text-anchor="middle" font-size="${Math.round(26 * s)}" fill="${soft}">${xml(`${p.position} · P${index + 1}`.toUpperCase())}</text>`,
      `</g>`,
    );
    return parts.join('');
  };

  const players = slots.map((slot) => player(model.starters[slot.index], slot.x, slot.y, slot.index)).join('');

  const shown = model.reserves.slice(0, L.reserveCapacity);
  const hidden = model.reserves.length - shown.length;
  const colWidth = courtW / L.reserveColumns;
  const reserveRows = shown
    .map((p, i) => {
      const x = courtLeft + (i % L.reserveColumns) * colWidth;
      const y = L.reserveFirstBaseline + Math.floor(i / L.reserveColumns) * L.reserveRowHeight;
      return `<text x="${x}" y="${y}" font-size="${Math.round(32 * (s > 1 ? 1.1 : 1))}" fill="${ink}"><tspan fill="${soft}">#${p.number}</tspan> ${xml(p.name.toUpperCase())}</text>`;
    })
    .join('');
  const moreLine = hidden > 0 ? `<text x="${courtLeft + courtW}" y="${L.benchTop}" text-anchor="end" font-size="30" fill="${soft}">+${hidden} RESERVAS</text>` : '';
  const liberoLine = model.libero && L.liberoBaseline !== null
    ? `<text x="${courtLeft}" y="${L.liberoBaseline}" font-size="32" fill="${ink}"><tspan fill="${soft}">LÍBERO #${model.libero.number}</tspan> ${xml(model.libero.name.toUpperCase())}</text>`
    : '';

  const opponentLine = `ALPHA7 X ${model.opponent.toUpperCase()}`;
  const meta = [model.competition, model.dateText, model.venue].filter((part) => part !== '');
  const textX = courtLeft + L.logoWidth + 28;

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Barlow Condensed','Arial Narrow',Impact,sans-serif" font-weight="700">`,
    `<defs>`,
    `<style>@font-face{font-family:'Barlow Condensed';font-weight:700;src:url(${assets.fontDataUri}) format('woff2');}</style>`,
    `<linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${bgTop}"/><stop offset="1" stop-color="${bgBottom}"/></linearGradient>`,
    ...clips,
    `</defs>`,
    `<rect width="${W}" height="${H}" fill="url(#bg)"/>`,
    `<image href="${logo}" x="${courtLeft}" y="${L.headerY}" width="${L.logoWidth}" height="${L.logoHeight}"/>`,
    `<text x="${textX}" y="${L.headerY + 62}" font-size="64" fill="${ink}" letter-spacing="2">ALPHA7</text>`,
    `<text x="${textX}" y="${L.headerY + 104}" font-size="30" fill="${soft}" letter-spacing="4">VOLLEYBALL PERFORMANCE</text>`,
    `<text x="${courtLeft}" y="${L.headerY + L.logoHeight + 96}" font-size="104" fill="${ink}">${xml(model.title.toUpperCase())}</text>`,
    `<text x="${courtLeft}" y="${L.headerY + L.logoHeight + 160}" font-size="${fit(opponentLine, 56, 26)}" fill="${soft}">${xml(opponentLine)}</text>`,
    `<text x="${courtLeft}" y="${L.headerY + L.logoHeight + 212}" font-size="${fit(meta.join(' · '), 34, 48)}" fill="${ink}">${xml(meta.join(' · '))}</text>`,
    `<rect x="${courtLeft}" y="${L.courtTop}" width="${courtW}" height="${L.courtHeight}" rx="18" fill="none" stroke="${soft}" stroke-width="4"/>`,
    `<line x1="${courtLeft}" y1="${L.attackLineY}" x2="${courtLeft + courtW}" y2="${L.attackLineY}" stroke="${soft}" stroke-width="3" stroke-dasharray="14 12" opacity="0.7"/>`,
    `<line x1="${courtLeft}" y1="${L.courtTop}" x2="${courtLeft + courtW}" y2="${L.courtTop}" stroke="${ink}" stroke-width="10"/>`,
    players,
    `<text x="${courtLeft}" y="${L.benchTop}" font-size="44" fill="${ink}" letter-spacing="3">RESERVAS</text>`,
    moreLine,
    `<line x1="${courtLeft}" y1="${L.benchTop + 14}" x2="${courtLeft + courtW}" y2="${L.benchTop + 14}" stroke="${soft}" stroke-width="3"/>`,
    shown.length === 0 ? `<text x="${courtLeft}" y="${L.reserveFirstBaseline}" font-size="32" fill="${soft}">SEM RESERVAS NA ESCALAÇÃO</text>` : reserveRows,
    liberoLine,
    `<text x="${W / 2}" y="${L.footerBaseline}" text-anchor="middle" font-size="28" fill="${soft}" letter-spacing="5">ALPHA7 VOLLEYBALL PERFORMANCE</text>`,
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
