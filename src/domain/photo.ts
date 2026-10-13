/**
 * FOTO DO ATLETA: regras puras de validação e de recorte. O desenho em canvas e o envio ficam fora do domínio.
 * Uma foto por atleta, sempre em proporção 4:5 (a mesma da carta, do perfil e da arte), reduzida e guardada como JPEG.
 */

/** Formatos aceitos na escolha do arquivo (o mesmo conjunto que o bucket do banco aceita). */
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** Teto do arquivo ESCOLHIDO (fotos de celular são grandes; o que se guarda é a versão reduzida). */
export const PHOTO_MAX_INPUT_BYTES = 12 * 1024 * 1024;
/** Teto da versão guardada: o bucket recusa acima de 1 MB. */
export const PHOTO_MAX_OUTPUT_BYTES = 900 * 1024;
export const PHOTO_OUTPUT = { width: 640, height: 800, quality: 0.86 } as const;
export const PHOTO_RATIO = PHOTO_OUTPUT.width / PHOTO_OUTPUT.height; // 0,8 = 4:5
/** Zoom máximo do recorte (1 = a foto inteira que cabe na moldura). */
export const PHOTO_MAX_ZOOM = 3;

export const isPhotoType = (type: string): boolean => (PHOTO_TYPES as readonly string[]).includes(type);

/** Mensagem de erro para o arquivo escolhido, ou null se serve. */
export function validatePhotoFile(file: { type: string; size: number }): string | null {
  if (!isPhotoType(file.type)) return 'Formato não aceito. Escolha uma imagem JPEG, PNG ou WebP.';
  if (file.size <= 0) return 'O arquivo está vazio.';
  if (file.size > PHOTO_MAX_INPUT_BYTES) return `A imagem é grande demais (limite de ${PHOTO_MAX_INPUT_BYTES / 1024 / 1024} MB). Escolha uma foto menor.`;
  return null;
}

export interface CropRect {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

/**
 * Retângulo de recorte 4:5 na imagem original. `zoom` ≥ 1 aproxima; `focusX` e `focusY` (0 a 1) escolhem para onde a
 * moldura se desloca dentro da área disponível (0,5 = centro). A moldura nunca sai da imagem.
 */
export function cropRect(imageWidth: number, imageHeight: number, zoom: number, focusX: number, focusY: number): CropRect {
  const coverWidth = imageWidth / imageHeight > PHOTO_RATIO ? imageHeight * PHOTO_RATIO : imageWidth;
  const coverHeight = coverWidth / PHOTO_RATIO;
  const z = clamp(zoom, 1, PHOTO_MAX_ZOOM);
  const sw = coverWidth / z;
  const sh = coverHeight / z;
  return {
    sx: (imageWidth - sw) * clamp(focusX, 0, 1),
    sy: (imageHeight - sh) * clamp(focusY, 0, 1),
    sw,
    sh,
  };
}

/** Caminho do arquivo no bucket: `{equipe}/{atleta}-{versão}.jpg`. A versão muda a cada envio (a URL nunca fica velha). */
export const photoPath = (teamId: string, playerId: string, version: number): string => `${teamId}/${playerId.replace(/[^A-Za-z0-9_-]/g, '_')}-${version}.jpg`;

/** Referência guardada no atleta: caminho do bucket (nuvem) ou data URL (modo local). */
export const isDataUrl = (reference: string): boolean => /^data:image\/(?:jpeg|png|webp);base64,/.test(reference);
