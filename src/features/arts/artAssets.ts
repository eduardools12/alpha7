import logoPurple from '../../../public/brand/a7-mark-art-purple.png?inline';
import logoWhite from '../../../public/brand/a7-mark-art-white.png?inline';
import type { ArtAssets } from './engine/canvas';

/**
 * Logo oficial derivada do arquivo original (mesmo desenho; só o fundo vira transparência), com as bordas limpas: as
 * versões `a7-mark-*.png` da interface guardam um resíduo de transparência no fundo que aparece como caixa sobre branco.
 * Embutida como data URI: o gerador não depende de rede nem de arquivos externos.
 */
export const ART_ASSETS: ArtAssets = { logoWhite, logoPurple };
