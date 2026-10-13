import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}
interface Manifest {
  name: string;
  short_name: string;
  start_url: string;
  scope: string;
  display: string;
  lang: string;
  background_color: string;
  theme_color: string;
  icons: ManifestIcon[];
  shortcuts: { name: string; url: string }[];
}

/** O Vitest roda sempre na raiz do projeto. */
const read = (path: string) => readFileSync(join(process.cwd(), path));
const manifest = JSON.parse(read('public/manifest.webmanifest').toString('utf-8')) as Manifest;

/** Largura e altura gravadas no cabeçalho IHDR do PNG. */
function pngSize(path: string): string {
  const bytes = read(`public${path}`);
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe('manifesto do aplicativo instalável', () => {
  it('abre em tela cheia, em português, com as cores oficiais', () => {
    expect(manifest).toMatchObject({ name: 'Alpha7 Volleyball Performance', short_name: 'Alpha7', display: 'standalone', lang: 'pt-BR', start_url: '/', scope: '/' });
    expect(manifest.theme_color.toLowerCase()).toBe('#270949');
    expect(manifest.background_color.toLowerCase()).toBe('#17141d');
  });

  it('tem ícones 192 e 512 e um maskable, e cada arquivo existe com o tamanho declarado', () => {
    const purposes = manifest.icons.map((i) => `${i.sizes}:${i.purpose ?? 'any'}`);
    expect(purposes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
    for (const icon of manifest.icons) {
      expect(icon.type).toBe('image/png');
      expect(pngSize(icon.src)).toBe(icon.sizes);
    }
    expect(pngSize('/apple-touch-icon.png')).toBe('180x180');
  });

  it('os atalhos apontam para telas que existem', () => {
    expect(manifest.shortcuts.map((s) => s.url)).toEqual(['/partidas', '/treinos', '/elenco']);
  });

  it('index.html liga o manifesto, o ícone da Apple e a cor da barra', () => {
    const html = read('index.html').toString('utf-8');
    expect(html).toContain('<link rel="manifest" href="/manifest.webmanifest"');
    expect(html).toContain('rel="apple-touch-icon" href="/apple-touch-icon.png"');
    expect(html).toContain('name="theme-color" content="#270949"');
  });

  it('a Vercel serve o service worker sem cache e o manifesto com o tipo certo', () => {
    const vercel = JSON.parse(read('vercel.json').toString('utf-8')) as { headers: { source: string; headers: { key: string; value: string }[] }[] };
    const rule = (source: string) => vercel.headers.find((h) => h.source === source)?.headers ?? [];
    expect(rule('/sw.js')).toContainEqual({ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' });
    expect(rule('/manifest.webmanifest')).toContainEqual({ key: 'Content-Type', value: 'application/manifest+json' });
  });
});
