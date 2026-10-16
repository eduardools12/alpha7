import { ART_FORMATS, type ArtModel } from '@/domain/arts';
import { ArtCanvas, type ArtAssets } from './canvas';
import type { Measure } from './measure';
import { TONES } from './palette';
import { drawAthlete, drawCard, drawHighlights, drawSpotlight } from './templates/athlete';
import { drawBrand, drawCover } from './templates/institutional';
import { drawLineup, drawMatchday, drawResult } from './templates/match';

export interface RenderContext {
  assets: ArtAssets;
  measure: Measure;
}

export interface RenderedArt {
  svg: string;
  width: number;
  height: number;
  /** Avisos de composição (texto fora da margem, cortado ou sobreposto). Vazio = em ordem. */
  warnings: string[];
}

function titleOf(model: ArtModel): string {
  switch (model.kind) {
    case 'lineup':
      return `Alpha 7: escalação contra ${model.opponent}`;
    case 'matchday':
      return `Alpha 7: dia de jogo contra ${model.opponent}`;
    case 'result':
      return `Alpha 7: resultado contra ${model.opponent}`;
    case 'athlete':
      return `Alpha 7: ${model.player.fullName}`;
    case 'spotlight':
      return `Alpha 7: destaque ${model.player.fullName}`;
    case 'card':
      return `Alpha 7: carta de ${model.player.fullName}`;
    case 'highlights':
      return `Alpha 7: ${model.title} de ${model.player.fullName}`;
    case 'brand':
      return 'Alpha 7: institucional';
    case 'cover':
      return `Alpha 7: capa ${model.variant}`;
  }
}

/**
 * Desenha a arte como SVG (texto puro, determinístico: o mesmo modelo e a mesma medição geram sempre o mesmo texto).
 * A prévia da tela e o PNG baixado usam ESTE mesmo SVG.
 */
export function renderArt(model: ArtModel, context: RenderContext): RenderedArt {
  const format = ART_FORMATS[model.format];
  const canvas = new ArtCanvas({
    width: format.width,
    height: format.height,
    background: TONES[model.tone].bg,
    title: titleOf(model),
    measure: context.measure,
    assets: context.assets,
  });
  switch (model.kind) {
    case 'lineup':
      drawLineup(canvas, model);
      break;
    case 'matchday':
      drawMatchday(canvas, model);
      break;
    case 'result':
      drawResult(canvas, model);
      break;
    case 'athlete':
      drawAthlete(canvas, model);
      break;
    case 'spotlight':
      drawSpotlight(canvas, model);
      break;
    case 'card':
      drawCard(canvas, model);
      break;
    case 'highlights':
      drawHighlights(canvas, model);
      break;
    case 'brand':
      drawBrand(canvas, model);
      break;
    case 'cover':
      drawCover(canvas, model);
      break;
  }
  return { svg: canvas.svg(), width: format.width, height: format.height, warnings: canvas.warnings() };
}
