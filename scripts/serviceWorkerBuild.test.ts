import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildVersion, precacheUrls, renderServiceWorker, type BuiltFile } from './serviceWorkerBuild';

const file = (path: string, text = path): BuiltFile => ({ path, content: new TextEncoder().encode(text) });

describe('precacheUrls', () => {
  it('guarda a casca em "/" e tudo o que o build gerou', () => {
    const urls = precacheUrls([file('index.html'), file('assets/index-abc.js'), file('assets/index-abc.css'), file('manifest.webmanifest'), file('icon-192.png')]);
    expect(urls).toEqual(['/', '/assets/index-abc.css', '/assets/index-abc.js', '/icon-192.png', '/manifest.webmanifest']);
  });

  it('não guarda o próprio sw.js, mapas de código nem os originais grandes da marca', () => {
    const urls = precacheUrls([file('sw.js'), file('assets/a.js.map'), file('brand/original/a7-logo.jpeg'), file('brand/a7-mark-white.png')]);
    expect(urls).toEqual(['/brand/a7-mark-white.png']);
  });

  it('guarda a fonte woff2 e não a woff de reserva (instalação mais leve)', () => {
    expect(precacheUrls([file('assets/f.woff2'), file('assets/f.woff')])).toEqual(['/assets/f.woff2']);
  });
});

describe('buildVersion', () => {
  it('é igual quando nada mudou, mesmo com a ordem diferente (sem aviso de atualização à toa)', () => {
    const a = [file('index.html', 'x'), file('assets/a.js', 'y')];
    expect(buildVersion(a)).toBe(buildVersion([...a].reverse()));
  });

  it('muda quando o conteúdo de qualquer arquivo muda', () => {
    expect(buildVersion([file('index.html', 'x')])).not.toBe(buildVersion([file('index.html', 'z')]));
  });

  it('não depende do próprio sw.js', () => {
    const base = [file('index.html', 'x')];
    expect(buildVersion(base)).toBe(buildVersion([...base, file('sw.js', 'qualquer coisa')]));
  });
});

describe('renderServiceWorker', () => {
  const template = readFileSync(join(process.cwd(), 'scripts/sw.template.js'), 'utf-8');

  it('troca versão e lista, e o resultado é JavaScript válido', () => {
    const output = renderServiceWorker(template, ['/', '/assets/a.js'], 'abc123');
    expect(output).toContain("const VERSION = 'abc123';");
    expect(output).toContain('"/assets/a.js"');
    expect(output).not.toContain('__VERSION__');
    expect(output).not.toContain('__PRECACHE__');
    expect(() => new Script(output)).not.toThrow();
  });

  it('o cache ignora o Vary da resposta (senão `Vary: Origin` faz as telas carregadas sob demanda falharem sem internet)', () => {
    expect(template).toContain('{ ignoreVary: true }');
  });

  it('cada marcador aparece uma única vez no modelo (senão a troca atinge um comentário e não o código)', () => {
    expect(template.match(/__VERSION__/g)).toHaveLength(1);
    expect(template.match(/__PRECACHE__/g)).toHaveLength(1);
  });

  it('recusa um modelo sem os marcadores, em vez de gerar um service worker sem cache', () => {
    expect(() => renderServiceWorker('self.x = 1;', [], 'v')).toThrow(/__VERSION__/);
  });

  it('o modelo não intercepta outras origens (dados e login do Supabase) nem grava', () => {
    expect(template).toContain('url.origin !== self.location.origin');
    expect(template).toContain("request.method !== 'GET'");
    expect(template).toContain("'SKIP_WAITING'");
    // Uma versão nova nunca assume sozinha: não há skipWaiting fora do tratador de mensagem.
    expect(template.match(/skipWaiting\(\)/g)).toHaveLength(1);
  });
});
