import type { TrackBox } from '@/domain/videoReview';

/**
 * Cores das trilhas. O canvas não lê as variáveis CSS, então este é o mesmo caso dos gráficos (exceção documentada ao uso só
 * de tokens). A mesma trilha mantém a mesma cor; detecção sem trilha é cinza e tracejada.
 */
const PALETTE = ['#ff8000', '#00c800', '#ff8000', '#ff00a0', '#00dcdc', '#c850ff', '#50b4ff', '#ffc850', '#78ff78', '#ff3c3c', '#c8c800', '#a078ff'];
const UNTRACKED = '#aaaaaa';

export const trackColor = (trackId: number | null): string => (trackId === null ? UNTRACKED : (PALETTE[trackId % PALETTE.length] ?? UNTRACKED));

/** Desenha as caixas. `scale` converte os pixels da análise para os pixels do canvas. O texto "T<n>" é o número TEMPORÁRIO do rastreador. */
export function drawBoxes(ctx: CanvasRenderingContext2D, boxes: readonly TrackBox[], scale: number): void {
  ctx.lineWidth = 2;
  ctx.font = '600 12px Inter, sans-serif';
  for (const box of boxes) {
    const [x1, y1, x2, y2] = box.bbox;
    const color = trackColor(box.trackId);
    ctx.strokeStyle = color;
    ctx.setLineDash(box.trackId === null ? [4, 3] : []);
    ctx.strokeRect(x1 * scale, y1 * scale, (x2 - x1) * scale, (y2 - y1) * scale);
    const label = box.trackId === null ? '?' : `T${box.trackId}`;
    const width = ctx.measureText(label).width + 8;
    const top = Math.max(0, y1 * scale - 16);
    ctx.fillStyle = color;
    ctx.fillRect(x1 * scale, top, width, 16);
    ctx.fillStyle = '#000000';
    ctx.fillText(label, x1 * scale + 4, top + 12);
  }
  ctx.setLineDash([]);
}
