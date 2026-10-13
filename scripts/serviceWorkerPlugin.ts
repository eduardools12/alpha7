import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import type { Plugin } from 'vite';
import { buildVersion, precacheUrls, renderServiceWorker, type BuiltFile } from './serviceWorkerBuild.ts';

function listFiles(dir: string, root = dir): BuiltFile[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return listFiles(full, root);
    return [{ path: relative(root, full).split(sep).join('/'), content: readFileSync(full) }];
  });
}

/**
 * Gera dist/sw.js depois do build, com a lista exata dos arquivos gerados. Sem dependência nova: é só ler a pasta
 * de saída. No servidor de desenvolvimento não há service worker (evita cache atrapalhando a edição).
 */
export function serviceWorkerPlugin(): Plugin {
  let outDir = 'dist';
  return {
    name: 'alpha7-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    writeBundle() {
      const files = listFiles(outDir);
      const template = readFileSync(new URL('./sw.template.js', import.meta.url), 'utf-8');
      writeFileSync(join(outDir, 'sw.js'), renderServiceWorker(template, precacheUrls(files), buildVersion(files)));
    },
  };
}
