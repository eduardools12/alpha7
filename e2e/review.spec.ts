import AxeBuilder from '@axe-core/playwright';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
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

/**
 * Cadastra uma partida de 1 set com a escalação de exemplo, inicia o jogo e registra 3 pontos (Alpha7, adversário, Alpha7)
 * com pausas, para a lista de pontos da revisão ter horários de registro diferentes.
 */
async function openReviewWithPoints(page: Page, outputPath: (name: string) => string) {
  await page.goto('/partidas/nova');
  await page.getByLabel('Adversário').fill('Time Revisão');
  await page.getByLabel('Quantidade de sets').selectOption('1');
  await page.getByLabel('Pontos de cada set').fill('25');
  await page.getByLabel('Escalação salva (opcional)').selectOption({ label: 'Escalação de exemplo' });
  await page.getByRole('button', { name: 'Cadastrar partida' }).click();
  await expect(page.getByText('Partida cadastrada.')).toBeVisible();
  await page.getByRole('link', { name: 'Iniciar' }).first().click();
  await page.getByRole('button', { name: 'Iniciar set 1' }).click();
  const us = page.getByRole('button', { name: 'Ponto do Alpha7' });
  await us.click();
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Ponto do adversário' }).click();
  await page.waitForTimeout(1500);
  await us.click();
  await page.goto('/partidas');
  await page.getByRole('link', { name: 'Detalhes' }).first().click();
  await page.getByRole('link', { name: 'Revisar com vídeo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Revisão com vídeo' })).toBeVisible();
  await openFiles(page, outputPath);
}

/** Abre o vídeo e a análise (os mesmos arquivos de sempre) na tela de revisão que já está aberta. */
async function openFiles(page: Page, outputPath: (name: string) => string) {
  const jsonPath = outputPath('analise.json');
  writeFileSync(jsonPath, JSON.stringify(analysis()));
  await page.getByLabel('Vídeo do jogo').setInputFiles(VIDEO);
  await page.getByLabel('Análise (.json)').setInputFiles(jsonPath);
  await expect(page.getByText(/quadros analisados/)).toBeVisible();
  await page.waitForFunction(() => (document.querySelector('video') as HTMLVideoElement | null)?.readyState === 4);
  await expect(page.getByLabel('Atleta da trilha T1')).toBeEnabled(); // o registro guardado já foi lido
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

test.describe('associações e pontos da partida no desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('associa um atleta, sobrevive ao recarregar (IndexedDB real), exporta, importa e liga os pontos ao vídeo', async ({ page }, testInfo) => {
    test.setTimeout(180_000);
    await openReviewWithPoints(page, (name) => testInfo.outputPath(name));
    const select = page.getByLabel('Atleta da trilha T1');

    // Clicar na caixa pausa o vídeo e leva o foco ao seletor daquela trilha.
    await seek(page, 1.0);
    const scale = await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).clientWidth / 320);
    await page.locator('video').click({ position: { x: 140 * scale, y: 100 * scale } });
    await expect(select).toBeFocused();
    expect(await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).paused)).toBe(true);

    // Associar: o nome aparece na lista de trilhas.
    const firstAthlete = String(await select.locator('option').nth(1).textContent());
    expect(firstAthlete.length).toBeGreaterThan(0);
    await select.selectOption({ index: 1 });
    await expect(page.getByRole('button', { name: `T1 · ${firstAthlete} · ` })).toBeVisible();

    // Recarregar a página e abrir os MESMOS arquivos: a associação volta do navegador (IndexedDB de verdade).
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Revisão com vídeo' })).toBeVisible();
    await openFiles(page, (name) => testInfo.outputPath(name));
    await expect(select.locator('option:checked')).toHaveText(firstAthlete);

    // Exportar baixa o arquivo; trocar a associação e importar o arquivo restaura a original.
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exportar associações' }).click()]);
    expect(download.suggestedFilename()).toMatch(/^alpha7-revisao-time-revisao-\d{4}-\d{2}-\d{2}\.json$/);
    const saved = testInfo.outputPath('exportado.json');
    await download.saveAs(saved);
    const exported = JSON.parse(readFileSync(saved, 'utf-8')) as { schema_version: string; assignments: unknown[] };
    expect(exported.schema_version).toBe('alpha7.video-review/1');
    expect(exported.assignments).toHaveLength(1);
    await select.selectOption({ value: '' });
    await page.getByLabel('Importar associações (.json)').setInputFiles(saved);
    await expect(page.getByText('1 associação importada.')).toBeVisible();
    await expect(select.locator('option:checked')).toHaveText(firstAthlete);

    // Arquivo que não é de revisão é recusado e nada muda.
    const lixo = testInfo.outputPath('lixo.json');
    writeFileSync(lixo, '{ não é json');
    await page.getByLabel('Importar associações (.json)').setInputFiles(lixo);
    await expect(page.getByRole('alert').filter({ hasText: 'Arquivo de revisão recusado' })).toContainText('Nada foi alterado');
    await expect(select.locator('option:checked')).toHaveText(firstAthlete);

    // Pontos: marcar o 1º ponto no instante atual do vídeo liga os outros pelo horário do registro (aproximado).
    const points = page.getByRole('region', { name: 'Pontos da partida' });
    await expect(points.getByText('Set 1')).toBeVisible();
    await seek(page, 1.0);
    await points.getByRole('button', { name: 'Marcar o ponto 1 x 0 no instante atual' }).click();
    await expect(points.getByText('Vídeo 0:01').first()).toBeVisible();
    await expect(points.getByText(/^Vídeo 0:0[4-8]$/)).toBeVisible(); // 3º ponto: cerca de 3 s depois do 1º no registro, mais 1 s
    await points.getByRole('button', { name: 'Ir para o vídeo: ponto 2 x 1' }).click();
    expect(await page.evaluate(() => (document.querySelector('video') as HTMLVideoElement).currentTime)).toBe(0); // 5 s antes cai antes do início
    await points.getByRole('button', { name: 'Limpar referência do set 1' }).click();
    await expect(points.getByRole('button', { name: 'Ir para o vídeo: ponto 2 x 1' })).toBeDisabled();
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
      await openReviewWithPoints(page, (name) => testInfo.outputPath(name));
      await expect(page.getByRole('region', { name: 'Pontos da partida' }).getByText('Set 1')).toBeVisible();
      const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
      expect(overflow.scroll, 'rolagem horizontal na revisão').toBeLessThanOrEqual(overflow.client);
      for (const name of ['0,25x', '0,5x', '1x', '2x', 'Quadro anterior', 'Próximo quadro']) {
        const box = await page.getByRole('button', { name, exact: true }).boundingBox();
        expect(box?.height ?? 0, `${name}: altura do alvo de toque`).toBeGreaterThanOrEqual(44);
      }
      const track = await page.getByRole('button', { name: /^T1 · / }).boundingBox();
      expect(track?.height ?? 0, 'trilha: altura do alvo de toque').toBeGreaterThanOrEqual(44);
      for (const target of [
        page.getByLabel('Atleta da trilha T1'),
        page.getByRole('button', { name: 'Exportar associações' }),
        page.getByRole('button', { name: /^Marcar o ponto 1 x 0/ }),
        page.getByRole('button', { name: /^Ir para o vídeo: ponto 1 x 0/ }),
      ]) {
        expect((await target.boundingBox())?.height ?? 0, 'alvo de toque da revisão').toBeGreaterThanOrEqual(44);
      }
      await seek(page, 1.0);
      expect((await overlayPixel(page, 140, 60)).rgba[3], 'caixa desenhada também no celular').toBeGreaterThan(100);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`), 'acessibilidade na revisão').toEqual([]);
    });
  });
}
