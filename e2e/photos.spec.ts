import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Fotos dos atletas no navegador real (modo local): o recorte e a redução acontecem no canvas de verdade, e a mesma
 * foto cadastrada aparece no perfil, na carta, na quadra da escalação e na arte PNG baixada.
 * O Storage da nuvem e as permissões por papel são cobertos por testes com cliente simulado e pelo teste SQL do bucket.
 */

/** Gera uma imagem JPEG 900x1200 (verde puro com uma faixa roxa) direto no navegador: sem rostos nem arquivos de terceiros. */
async function makeImage(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 900;
    canvas.height = 1200;
    const context = canvas.getContext('2d');
    if (!context) return '';
    context.fillStyle = '#00d000';
    context.fillRect(0, 0, 900, 1200);
    context.fillStyle = '#6a2fb0';
    context.fillRect(0, 900, 900, 300);
    return canvas.toDataURL('image/jpeg', 0.9).split(',')[1] ?? '';
  });
  return Buffer.from(base64, 'base64');
}

async function addPhoto(page: Page, playerId: string) {
  await page.goto(`/elenco/${playerId}`);
  await expect(page.getByText('Foto do atleta')).toBeVisible();
  const file = await makeImage(page);
  await page.getByLabel('Escolher arquivo da foto').setInputFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: file });
  await expect(page.getByRole('img', { name: /Prévia do recorte da foto/ })).toBeVisible();
  await page.getByLabel('Zoom').fill('1.5');
  await page.getByRole('button', { name: 'Salvar foto' }).click();
  await expect(page.getByText('Foto salva.')).toBeVisible();
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
  test.describe(`fotos no ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('o recorte vira JPEG 640x800 e a mesma foto aparece no perfil, na carta e depois de recarregar', async ({ page }) => {
      await addPhoto(page, 'demo-p-08');
      const hero = page.getByRole('img', { name: 'Foto de Gabriel S.' }).first();
      await expect(hero).toBeVisible();
      const size = await hero.evaluate((img: HTMLImageElement) => ({ w: img.naturalWidth, h: img.naturalHeight, src: img.src }));
      expect(size.w).toBe(640);
      expect(size.h).toBe(800);
      expect(size.src.startsWith('data:image/jpeg;base64,')).toBe(true);

      await page.goto('/elenco');
      const cardImg = page.getByRole('link', { name: /Gabriel S\., camisa 8/ }).getByRole('img', { name: 'Foto de Gabriel S.' });
      await expect(cardImg).toBeVisible();
      expect(await cardImg.evaluate((img: HTMLImageElement) => img.src)).toBe(size.src); // a MESMA foto, não uma cópia

      await page.reload();
      await expect(page.getByRole('link', { name: /Gabriel S\., camisa 8/ }).getByRole('img', { name: 'Foto de Gabriel S.' })).toBeVisible();
    });

    test('formato errado é recusado, cancelar não grava e remover pede confirmação', async ({ page }) => {
      await page.goto('/elenco/demo-p-05');
      await page.getByLabel('Escolher arquivo da foto').setInputFiles({ name: 'doc.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
      await expect(page.getByText(/Formato não aceito/)).toBeVisible();
      await page.getByLabel('Escolher arquivo da foto').setInputFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: await makeImage(page) });
      await expect(page.getByRole('img', { name: /Prévia do recorte/ })).toBeVisible();
      await page.getByRole('button', { name: 'Cancelar' }).click();
      await expect(page.getByRole('img', { name: 'Foto de Felipe B.' })).toHaveCount(0);

      await addPhoto(page, 'demo-p-05');
      await page.getByRole('button', { name: 'Remover foto' }).click();
      await expect(page.getByText(/A foto sai da carta/)).toBeVisible();
      await page.getByRole('button', { name: 'Cancelar' }).click();
      await expect(page.getByRole('img', { name: 'Foto de Felipe B.' }).first()).toBeVisible();
      await page.getByRole('button', { name: 'Remover foto' }).click();
      await page.getByRole('button', { name: 'Confirmar remoção' }).click();
      await expect(page.getByText(/Foto removida/)).toBeVisible();
      await expect(page.getByRole('img', { name: 'Foto de Felipe B.' })).toHaveCount(0);
    });

    test('a arte PNG baixada mostra a foto do atleta no lugar certo; sem foto, o número', async ({ page }, info) => {
      await addPhoto(page, 'demo-p-08'); // Gabriel S. joga em P2 na escalação de exemplo
      await page.goto('/partidas/nova');
      await page.getByLabel('Adversário').fill('Time Foto');
      await page.getByLabel('Escalação salva (opcional)').selectOption({ label: 'Escalação de exemplo' });
      await page.getByRole('button', { name: 'Cadastrar partida' }).click();
      await expect(page.getByText('Partida cadastrada.')).toBeVisible();
      await page.goto('/artes');
      const preview = page.getByRole('img', { name: /Prévia da arte da escalação contra Time Foto/ });
      await expect(preview).toBeVisible();
      const svg = decodeURIComponent((await preview.getAttribute('src')) ?? '');
      expect(svg).toContain('data:image/jpeg;base64,'); // a foto está no mesmo SVG que vira PNG
      expect(svg).toContain('clip-path="url(#clip-1)"'); // P2

      const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Baixar PNG' }).click()]);
      const file = info.outputPath(download.suggestedFilename());
      await download.saveAs(file);
      const bytes = readFileSync(file);
      expect(bytes.readUInt32BE(16)).toBe(1080);
      expect(bytes.readUInt32BE(20)).toBe(1350);
      // Centro do disco de P2 (cartaz): x = 90 + 900 * 0,83; y = fileira da rede. Ali está a foto (verde), não o roxo do disco.
      const [r, g, b] = await pixel(page, bytes, 837, 560);
      expect(g, `pixel da foto: rgb(${r},${g},${b})`).toBeGreaterThan(150);
      expect(r ?? 255).toBeLessThan(120);
      // O disco de P3 (sem foto) continua com o fundo violeta do avatar padrão.
      const [pr, pg, pb] = await pixel(page, bytes, 540 + 40, 560 - 50);
      expect(pg ?? 255, `pixel sem foto: rgb(${pr},${pg},${pb})`).toBeLessThan(120);
    });

    test('perfil com foto: sem rolagem horizontal e sem violações de acessibilidade', async ({ page }) => {
      await addPhoto(page, 'demo-p-08');
      const overflow = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }));
      expect(overflow.s).toBeLessThanOrEqual(overflow.c);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
      await page.goto('/elenco');
      const again = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(again.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`)).toEqual([]);
    });
  });
}
