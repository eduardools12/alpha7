/**
 * Faz o navegador baixar um texto como arquivo. Ação sempre iniciada pela pessoa (clique em
 * "Exportar"): nada é baixado nem enviado sozinho, e o conteúdo nunca sai deste computador.
 */
export function downloadTextFile(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Dá tempo ao navegador de iniciar o download antes de liberar o endereço temporário.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
