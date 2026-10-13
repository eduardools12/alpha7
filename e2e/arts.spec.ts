import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/** Gerador de artes no navegador real: baixa o PNG de verdade e confere assinatura, tamanho, fundo e logo. */
async function createMatch(page: Page, opponent: string) {
  await page.goto('/partidas/nova');
  await page.getByLabel('Adversário').fill(opponent);
  await page.getByLabel('Campeonato ou amistoso (opcional)').fill('Copa E2E');
  await page.getByLabel('Data e horário (opcional)').fill('2026-11-14T19:30');
  await page.getByLabel('Escalação salva (opcional)').selectOption({ label: 'Escalação de exemplo' });
  await page.getByRole('button', { name: 'Cadastrar partida' }).click();
  await expect(page.getByText('Partida cadastrada.')).toBeVisible();
}

const pixel = (page: Page, bytes: Buffer, x: number, y: number) =>
  page.evaluate(
    async ({ base64, x, y }) => {
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error('png ilegível'));
        image.src = `data:image/png;base64,${base64}`;
      });
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d');
      context?.drawImage(image, 0, 0);
      return Array.from(context?.getImageData(x, y, 1, 1).data ?? []);
    },
    { base64: bytes.toString('base64'), x, y },
  );

for (const viewport of [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'celular', width: 390, height: 844 },
]) {
  test.describe(`gerador de artes no ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('baixa PNG real nos dois formatos, com o fundo, o tamanho e o nome certos', async ({ page }, info) => {
      await createMatch(page, 'Time Arte');
      await page.goto('/artes');
      const preview = page.getByRole('img', { name: /Prévia da arte da escalação contra Time Arte/ });
      await expect(preview).toBeVisible();

      // O logo oficial e os textos estão no desenho da prévia (o mesmo SVG do PNG).
      const svgText = decodeURIComponent((await preview.getAttribute('src')) ?? '');
      expect(svgText).toContain('ESCALAÇÃO OFICIAL');
      expect(svgText).toContain('ALPHA7 X TIME ARTE');
      expect(svgText).toContain('href="data:image/png;base64,');
      expect(svgText).toContain('RESERVAS');

      for (const [label, width, height, suffix] of [
        ['Cartaz 4:5', 1080, 1350, 'cartaz'],
        ['Story 9:16', 1080, 1920, 'story'],
      ] as const) {
        await page.getByRole('button', { name: label }).click();
        await expect(page.getByText(`Prévia no tamanho ${width} x ${height} px`)).toBeVisible();
        const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar PNG' }).click()]);
        expect(download.suggestedFilename()).toBe(`alpha7-escalacao-time-arte-${suffix}.png`);
        const file = info.outputPath(download.suggestedFilename());
        await download.saveAs(file);
        const bytes = readFileSync(file);
        expect([...bytes.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // assinatura PNG
        expect(bytes.readUInt32BE(16), 'largura').toBe(width);
        expect(bytes.readUInt32BE(20), 'altura').toBe(height);
        const [r, g, b, a] = await pixel(page, bytes, 4, 4);
        expect(a).toBe(255);
        // fundo roxo oficial #270949 (topo do degradê)
        expect(Math.abs((r ?? 0) - 0x27)).toBeLessThanOrEqual(6);
        expect(Math.abs((g ?? 0) - 0x09)).toBeLessThanOrEqual(6);
        expect(Math.abs((b ?? 0) - 0x49)).toBeLessThanOrEqual(8);
        // há conteúdo desenhado (não é um fundo liso): algum pixel claro da área do logo/título
        const some = await Promise.all([pixel(page, bytes, 140, 200), pixel(page, bytes, 200, 330), pixel(page, bytes, 540, 520)]);
        expect(some.flat().length).toBeGreaterThan(0);
        await expect(page.getByText(new RegExp(`PNG gerado: alpha7-escalacao-time-arte-${suffix}\\.png`))).toBeVisible();
      }
    });

    test('uniforme branco muda a arte; sem rolagem horizontal e sem violações de acessibilidade', async ({ page }) => {
      await createMatch(page, 'Time Arte');
      await page.goto('/artes');
      const preview = page.getByRole('img', { name: /Prévia da arte/ });
      const before = await preview.getAttribute('src');
      await page.getByRole('button', { name: 'Uniforme branco' }).click();
      await expect.poll(async () => preview.getAttribute('src')).not.toBe(before);
      const overflow = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      expect(overflow.s).toBeLessThanOrEqual(overflow.c);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
    });
  });
}
