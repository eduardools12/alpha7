import { createHash } from 'node:crypto';

export interface BuiltFile {
  /** Caminho relativo à pasta de saída, com barras normais: `assets/index-abc.js`. */
  path: string;
  content: Uint8Array;
}

/**
 * Não entram na instalação: logos e uniformes originais (grandes e raros: são guardados só se alguém os abrir) e a fonte
 * `.woff`, reserva de navegadores antigos (todo navegador que instala o app usa a `.woff2`).
 */
const NOT_PRECACHED = [/^brand\/original\//, /^sw\.js$/, /\.map$/, /\.woff$/];

/** Endereços que o service worker guarda na instalação: a casca (`/`) e tudo o que o build gerou. */
export function precacheUrls(files: readonly BuiltFile[]): string[] {
  const urls = files
    .filter((file) => !NOT_PRECACHED.some((pattern) => pattern.test(file.path)))
    .map((file) => (file.path === 'index.html' ? '/' : `/${file.path}`));
  return [...new Set(urls)].sort();
}

/** Versão do conjunto: igual quando nada mudou (sem aviso de atualização à toa), diferente a cada mudança de conteúdo. */
export function buildVersion(files: readonly BuiltFile[]): string {
  const hash = createHash('sha256');
  for (const file of [...files].filter((f) => !/^sw\.js$/.test(f.path)).sort((a, b) => a.path.localeCompare(b.path))) {
    hash.update(file.path);
    hash.update('\0');
    hash.update(file.content);
    hash.update('\0');
  }
  return hash.digest('hex').slice(0, 12);
}

export function renderServiceWorker(template: string, urls: readonly string[], version: string): string {
  if (!template.includes('__VERSION__') || !template.includes('__PRECACHE__')) {
    throw new Error('O modelo do service worker precisa conter __VERSION__ e __PRECACHE__.');
  }
  return template.replace('__VERSION__', version).replace('__PRECACHE__', JSON.stringify(urls, null, 2));
}
