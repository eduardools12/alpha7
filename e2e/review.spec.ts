import AxeBuilder from '@axe-core/playwright';
import { statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Revisão com vídeo no Chrome REAL. O vídeo (`e2e/assets/clipe-sintetico.webm`: um retângulo andando, 2 s, 10 quadros/s,
 * 320x180) e o JSON de análise são SINTÉTICOS e coerentes entre si: provam o fluxo (abrir arquivos, tocar, buscar, desenhar
 * a caixa no lugar certo), não a qualidade da detecção em jogo real.
 */
const VIDEO = resolve('e2e/assets/clipe-sintetico.webm');
const FPS = 10;
const FRAMES = 20;

/** Caixa verdadeira do quadro i: o mesmo retângulo que o vídeo desenha. */
const boxAt = (i: number) => [20 + i * 10, 60, 60 + i * 10, 140];

const analysis = (overrides: Record<string, unknown> = {}) => ({
  schema_version: 'alpha7.video-analysis/1',
  source: { filename: 'clipe-sintetico.webm', size_bytes: statSync(VIDEO).size, width: 320, height: 180, fps: FPS, duration_s: 2 },
  frames: Array.from({ length: FRAMES }, (_, i) => ({
    frame_index: i,
    timestamp_ms: i * 100,
    detections: [{ track_id: 1, bbox_xyxy: boxAt(i), confidence: 0.9 }],
  })),
  tracks: [{ track_id: 1, first_timestamp_ms: 0, last_timestamp_ms: (FRAMES - 1) * 100, detections: FRAMES }],
  ...overrides,
});

async function openReview(page: Page, outputPath: (name: string) => string, json = analysis()) {
  await page.goto('/partidas/nova');
  await page.getByLabel('Adversário').fill('Time Revisão');
  await page.getByRole('button', { name: 'Cadastrar partida' }).click();
  await expect(page.getByText('Partida cadastrada.')).toBeVisible();
  await page.getByRole('link', { name: 'Detalhes' }).first().click();
  await page.getByRole('link', { name: 'Revisar com vídeo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Revisão com vídeo' })).toBeVisible();
  const jsonPath = outputPath('analise.json');
  writeFileSync(jsonPath, JSON.stringify(json));
  await page.getByLabel('Vídeo do jogo').setInputFiles(VIDEO);
  await page.getByLabel('Análise (.json)').setInputFiles(jsonPath);
  await expect(page.getByText(/quadros analisados/)).toBeVisible();
  await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement | null)?.readyState === 4);
}

const seek = (page: Page, seconds: number) =>
  page.evaluate(
    (t) =>
      new Promise<void>((done) => {
        const video = document.querySelector('video') as HTMLVideoElement;
        video.addEventListener('seeked', () => requestAnimationFrame(() => done()), { once: true });
        video.currentTime = t;
      }),
    seconds,
  );

/** Pixel do canvas de sobreposição (em coordenadas do VÍDEO original) e a escala usada. */
const overlayPixel = (page: Page, x: number, y: number) =>
  page.evaluate(
    ([px, py]) => {
      const video = document.querySelector('video') as HTMLVideoElement;
      const canvas = document.querySelector('canvas') as HTMLCanvasElement;
      const scale = canvas.width / 320;
      const data = canvas.getContext('2d')!.getImageData(Math.round((px as number) * scale), Math.round((py as number) * scale), 1, 1).data;
      return { rgba: Array.from(data), canvasWidth: canvas.width, videoWidth: video.clientWidth };
    },
    [x, y],
  );

test.describe('revisão com vídeo no desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('abre os arquivos, toca, busca e desenha a caixa em cima do retângulo do vídeo', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await openReview(page, (name) => testInfo.outputPath(name));
    await expect(page.getByText('Confira se é o mesmo vídeo', { exact: true })).toHaveCount(0); // o vídeo bate com a análise

    // Aos 1,0 s (quadro 10) o retângulo está em x 120..160, y 60..140: a borda de cima da caixa verde (T1) passa por (140, 60).
    await seek(page, 1.0);
    const edge = await overlayPixel(page, 140, 60);
    expect(edge.canvasWidth).toBe(edge.videoWidth);
    expect(edge.rgba[3], 'a borda da caixa foi desenhada').toBeGreaterThan(100);
    expect(edge.rgba[1], 'a cor é a da trilha T1 (verde)').toBeGreaterThan(edge.rgba[0] ?? 0);
    // E o meio do retângulo, por dentro, não tem desenho.
    expect((await overlayPixel(page, 140, 100)).rgba[3]).toBe(0);

    // Aos 0,2 s a caixa já saiu de onde estava aos 1,0 s: o desenho acompanha o tempo.
    await seek(page, 0.2);
    expect((await overlayPixel(page, 140, 60)).rgba[3]).toBe(0);
    expect((await overlayPixel(page, 50, 60)).rgba[3]).toBeGreaterThan(100); // retângulo do quadro 2: x 40..80

    // "Mostrar caixas" desligado limpa o desenho.
    await page.getByRole('checkbox', { name: 'Mostrar caixas' }).uncheck();
    await seek(page, 1.0);
    expect((await overlayPixel(page, 140, 60)).rgba[3]).toBe(0);
    await page.getByRole('checkbox', { name: 'Mostrar caixas' }).check();

    // A trilha leva o vídeo ao início dela; quadro seguinte anda 1/fps.
    await page.getByRole('button', { name: /^T1 · 0:00 a 0:01/ }).click();
    await expect.poll(() => page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).currentTime)).toBeCloseTo(0, 1);
    await page.getByRole('button', { name: 'Próximo quadro' }).click();
    await expect
      .poll(() => page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).currentTime))
      .toBeGreaterThan(0.05);

    // Velocidade e reprodução de verdade (mudo, para o Chrome permitir sem gesto).
    await page.getByRole('button', { name: '0,5x' }).click();
    expect(await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).playbackRate)).toBe(0.5);
    const played = await page.evaluate(async () => {
      const video = document.querySelector('video') as HTMLVideoElement;
      video.muted = true;
      video.currentTime = 0;
      await video.play();
      await new Promise((r) => setTimeout(r, 700));
      const advanced = video.currentTime;
      video.pause();
      return advanced;
    });
    expect(played).toBeGreaterThan(0.1);
  });

  test('análise de outro vídeo avisa sem bloquear, e análise inválida é recusada por inteiro', async ({ page }, testInfo) => {
    test.setTimeout(120_000);
    await openReview(page, (name) => testInfo.outputPath(name), analysis({ source: { filename: 'outro.mp4', size_bytes: 5, width: 1280, height: 720, fps: 30, duration_s: 600 } }) as ReturnType<typeof analysis>);
    await expect(page.getByText('Confira se é o mesmo vídeo', { exact: true })).toBeVisible();
    await expect(page.getByText(/A duração do vídeo/)).toBeVisible();
    await expect(page.getByRole('region', { name: 'Trilhas' })).toBeVisible(); // continua carregado

    const bad = testInfo.outputPath('ruim.json');
    writeFileSync(bad, '{ não é json');
    await page.getByLabel('Análise (.json)').setInputFiles(bad);
    await expect(page.getByRole('alert').filter({ hasText: 'Análise recusada' })).toContainText('Nada foi carregado');
    await expect(page.getByRole('region', { name: 'Trilhas' })).toHaveCount(0);
  });
});

const VIEWPORTS = [
  { name: 'celular pequeno', width: 360, height: 740 },
  { name: 'celular', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
];

for (const viewport of VIEWPORTS) {
  test.describe(`revisão com vídeo no ${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('sem rolagem horizontal, alvos de toque de 44px e auditoria de acessibilidade', async ({ page }, testInfo) => {
      test.setTimeout(120_000);
      await openReview(page, (name) => testInfo.outputPath(name));
      const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(overflow.scroll, 'rolagem horizontal na revisão').toBeLessThanOrEqual(overflow.client);
      for (const name of ['0,25x', '0,5x', '1x', '2x', 'Quadro anterior', 'Próximo quadro']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(box?.height ?? 0, `${name}: altura do alvo de toque`).toBeGreaterThanOrEqual(44);
      }
      const track = await page.getByRole('button', { name: /^T1 · / }).boundingBox();
      expect(track?.height ?? 0, 'trilha: altura do alvo de toque').toBeGreaterThanOrEqual(44);
      await seek(page, 1.0);
      expect((await overlayPixel(page, 140, 60)).rgba[3], 'caixa desenhada também no celular').toBeGreaterThan(100);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`), 'acessibilidade na revisão').toEqual([]);
    });
  });
}
