import { PHOTO_OUTPUT, cropRect } from '@/domain/photo';

/** Imagem carregada para o recorte: o que o editor precisa para desenhar a prévia e a versão final. */
export interface LoadedPhoto {
  width: number;
  height: number;
  /** Desenha o recorte (em pixels da imagem original) numa área de saída `width` x `height`. */
  draw(context: CanvasRenderingContext2D, sx: number, sy: number, sw: number, sh: number, width: number, height: number): void;
  release(): void;
}

/** Processamento da foto no navegador (canvas). O editor aceita outra implementação, para teste. */
export interface PhotoProcessor {
  load(file: File): Promise<LoadedPhoto>;
  /** Gera a versão final: 640 x 800, JPEG. */
  render(photo: LoadedPhoto, zoom: number, focusX: number, focusY: number): Promise<Blob>;
  /** Desenha a prévia do recorte num canvas já dimensionado. */
  preview(photo: LoadedPhoto, canvas: HTMLCanvasElement, zoom: number, focusX: number, focusY: number): void;
}

export const canvasProcessor: PhotoProcessor = {
  async load(file) {
    const url = URL.createObjectURL(file);
    const image = new Image();
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('Não foi possível abrir esta imagem. Ela pode estar corrompida.'));
        image.src = url;
      });
    } catch (error) {
      URL.revokeObjectURL(url);
      throw error;
    }
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: (context, sx, sy, sw, sh, w, h) => context.drawImage(image, sx, sy, sw, sh, 0, 0, w, h),
      release: () => URL.revokeObjectURL(url),
    };
  },

  preview(photo, canvas, zoom, focusX, focusY) {
    const context = canvas.getContext('2d');
    if (!context) return;
    const { sx, sy, sw, sh } = cropRect(photo.width, photo.height, zoom, focusX, focusY);
    photo.draw(context, sx, sy, sw, sh, canvas.width, canvas.height);
  },

  async render(photo, zoom, focusX, focusY) {
    const canvas = document.createElement('canvas');
    canvas.width = PHOTO_OUTPUT.width;
    canvas.height = PHOTO_OUTPUT.height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Este navegador não consegue preparar a foto.');
    // Fundo grafite: se a foto original tiver transparência (PNG), o JPEG não sai com preto estranho.
    context.fillStyle = '#17141d';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const { sx, sy, sw, sh } = cropRect(photo.width, photo.height, zoom, focusX, focusY);
    photo.draw(context, sx, sy, sw, sh, canvas.width, canvas.height);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível preparar a foto.'))), 'image/jpeg', PHOTO_OUTPUT.quality);
    });
  },
};
