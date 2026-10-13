/**
 * Compartilhar a arte pelo menu do celular (WhatsApp, Instagram, mensagens...) em vez de baixar o arquivo e abrir outro app.
 * Só existe onde o navegador aceita compartilhar ARQUIVOS (Chrome/Edge no Android, Safari no iPhone); no computador o botão
 * "Compartilhar" nem aparece e fica só o "Baixar PNG".
 */
export function pngFile(blob: Blob, filename: string): File {
  return new File([blob], filename, { type: 'image/png' });
}

export function canSharePng(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return false;
  try {
    return navigator.canShare({ files: [pngFile(new Blob(), 'teste.png')] });
  } catch {
    return false;
  }
}

/**
 * Abre o menu de compartilhar. `cancelled` é a pessoa fechar o menu sem escolher: não é erro e não deve mostrar aviso.
 * Qualquer outra falha sobe para a tela explicar (e oferecer o download).
 */
export async function sharePng(blob: Blob, filename: string, title: string): Promise<'shared' | 'cancelled'> {
  try {
    await navigator.share({ files: [pngFile(blob, filename)], title });
    return 'shared';
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}
