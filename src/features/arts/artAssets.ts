import fontDataUri from '@fontsource/barlow-condensed/files/barlow-condensed-latin-700-normal.woff2?inline';
import logoPurple from '../../../public/brand/a7-mark-purple.png?inline';
import logoWhite from '../../../public/brand/a7-mark-white.png?inline';
import type { ArtAssets } from './artSvg';

/** Logo oficial e fonte, embutidos como data URI (o gerador não depende de rede nem de arquivos externos). */
export const ART_ASSETS: ArtAssets = { fontDataUri, logoWhite, logoPurple };
