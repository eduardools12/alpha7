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

/** Baixa o PNG pelo navegador. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
