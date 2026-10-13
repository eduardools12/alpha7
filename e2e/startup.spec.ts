import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Inicialização e recuperação em navegador real. Aqui NÃO se usa o atalho de e2e/fixtures.ts:
 * o que se testa é justamente a tela de escolha e a de recuperação, com o localStorage de verdade.
 */
test.use({ viewport: { width: 1280, height: 900 } });

const KEY = 'alpha7.workspace.v1';
const firstUse = (page: Page) => page.getByRole('heading', { level: 1, name: 'Como você quer começar?' });
const recovery = (page: Page) => page.getByRole('heading', { level: 1, name: 'Recuperar os dados da equipe' });
const keys = (page: Page) => page.evaluate(() => Object.keys(localStorage).sort());

async function startWithDemo(page: Page) {
  await page.goto('/');
  await expect(firstUse(page)).toBeVisible();
  await page.getByRole('button', { name: 'Começar com dados de demonstração' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Alpha7 Performance' })).toBeVisible();
}

async function exportBackup(page: Page): Promise<string> {
  await page.goto('/configuracoes');
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup', exact: true }).click();
  return readFileSync(await (await waiting).path(), 'utf8');
}

const audit = async (page: Page, label: string) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')} :: ${v.nodes[0]?.any[0]?.message ?? ''}`), label).toEqual([]);
};

/** Elementos que passam da borda direita da tela (vazio = sem rolagem horizontal). */
const overflowing = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 1 && el.getBoundingClientRect().width > 0)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} (${Math.round(el.getBoundingClientRect().right)}px)`);
  });

test.describe('primeira utilização', () => {
  test('mostra a escolha e não grava nada antes de a pessoa escolher', async ({ page }) => {
    await page.goto('/');
    await expect(firstUse(page)).toBeVisible();
    await page.reload();
    await expect(firstUse(page)).toBeVisible();
    expect(await keys(page)).toEqual([]);
    await expect(page.getByText('Dados de demonstração', { exact: true })).toHaveCount(0);
  });

  test('"workspace vazio" persiste vazio ao recarregar (a demonstração não volta sozinha)', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Começar com workspace vazio' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Alpha7 Performance' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Alpha7 Performance' })).toBeVisible();
    expect(await page.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? '{}') as { players: unknown[] }).players.length, KEY)).toBe(0);
    await expect(page.getByText('Dados de demonstração', { exact: true })).toHaveCount(0);
  });

  test('"demonstração" fica identificada e persiste ao recarregar sem nova pergunta', async ({ page }) => {
    await startWithDemo(page);
    await expect(page.getByText('Dados de demonstração', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { level: 1, name: 'Alpha7 Performance' })).toBeVisible();
    await expect(firstUse(page)).toHaveCount(0);
  });

  for (const size of [{ width: 1280, height: 900 }, { width: 360, height: 740 }]) {
    test(`a tela de escolha passa na auditoria e cabe na tela (${size.width}px)`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      await expect(firstUse(page)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await audit(page, 'tela de escolha');
      expect(await overflowing(page), 'passa da borda').toEqual([]);
    });
  }
});

test.describe('workspace ausente depois de já ter existido', () => {
  test('sem a chave principal, abre a recuperação em vez de uma demonstração, e nada é gravado', async ({ page }) => {
    await startWithDemo(page);
    await page.evaluate((key) => localStorage.removeItem(key), KEY);
    const before = await keys(page);
    await page.reload();

    await expect(recovery(page)).toBeVisible();
    await expect(page.getByText('Os dados da equipe não foram encontrados')).toBeVisible();
    await expect(page.getByText('Dados de demonstração', { exact: true })).toHaveCount(0);
    expect(await keys(page)).toEqual(before);
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull();
  });

  test('importar um backup pela recuperação restaura o workspace inteiro', async ({ page }) => {
    await startWithDemo(page);
    const text = await exportBackup(page);
    await page.evaluate((key) => localStorage.removeItem(key), KEY);
    await page.goto('/elenco');
    await expect(recovery(page)).toBeVisible();

    await page.getByLabel('Arquivo de backup (.json)').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    const preview = page.getByRole('region', { name: 'Prévia do backup' });
    await expect(preview.getByRole('row', { name: /Atletas 18/ })).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBeNull(); // a prévia não grava
    await preview.getByRole('button', { name: 'Restaurar este backup' }).click();
    await expect(page.getByText('18 jogadores', { exact: true })).toBeVisible();
  });

  test('arquivo adulterado é recusado e a recuperação continua intacta', async ({ page }) => {
    await startWithDemo(page);
    const text = await exportBackup(page);
    await page.evaluate((key) => localStorage.removeItem(key), KEY);
    await page.goto('/');
    await expect(recovery(page)).toBeVisible();
    const before = await keys(page);

    await page.getByLabel('Arquivo de backup (.json)').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from(text.replace('Gabriel', 'Gabrielx')) });
    await expect(page.getByText('Arquivo recusado. Nada foi alterado.')).toBeVisible();
    expect(await keys(page)).toEqual(before);
    await expect(recovery(page)).toBeVisible();
  });

  test('"Tentar novamente" reabre o workspace quando os dados voltam', async ({ page }) => {
    await startWithDemo(page);
    const raw = await page.evaluate((key) => localStorage.getItem(key), KEY);
    await page.evaluate((key) => localStorage.removeItem(key), KEY);
    await page.goto('/elenco');
    await expect(recovery(page)).toBeVisible();

    await page.evaluate(([key, value]) => localStorage.setItem(key as string, value as string), [KEY, raw]);
    await page.getByRole('button', { name: 'Tentar novamente' }).click();
    await expect(page.getByText('18 jogadores', { exact: true })).toBeVisible();
  });

  test('começar um workspace novo só depois de confirmar; cancelar não muda nada', async ({ page }) => {
    await startWithDemo(page);
    await page.evaluate((key) => localStorage.removeItem(key), KEY);
    await page.goto('/');
    await expect(recovery(page)).toBeVisible();
    const before = await keys(page);

    await page.getByRole('button', { name: 'Começar um workspace novo…' }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    expect(await keys(page)).toEqual(before);

    await page.getByRole('button', { name: 'Começar um workspace novo…' }).click();
    await page.getByRole('button', { name: 'Confirmar: começar com workspace vazio' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Alpha7 Performance' })).toBeVisible();
    expect(await page.evaluate((key) => (JSON.parse(localStorage.getItem(key) ?? '{}') as { players: unknown[] }).players.length, KEY)).toBe(0);
  });

  for (const size of [{ width: 1280, height: 900 }, { width: 360, height: 740 }]) {
    test(`a recuperação passa na auditoria e cabe na tela (${size.width}px)`, async ({ page }) => {
      await page.setViewportSize(size);
      await startWithDemo(page);
      await page.evaluate((key) => localStorage.removeItem(key), KEY);
      await page.goto('/');
      await expect(recovery(page)).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await audit(page, 'recuperação');
      expect(await overflowing(page), 'passa da borda').toEqual([]);
      await page.getByRole('button', { name: 'Começar um workspace novo…' }).click();
      await audit(page, 'confirmação de workspace novo');
      expect(await overflowing(page), 'passa da borda na confirmação').toEqual([]);
    });
  }
});

test.describe('dados ilegíveis', () => {
  test('preserva o texto, permite baixá-lo e só recomeça depois de confirmar', async ({ page }) => {
    await startWithDemo(page);
    await page.evaluate((key) => localStorage.setItem(key, '{conteudo quebrado'), KEY);
    await page.reload();

    await expect(recovery(page)).toBeVisible();
    await expect(page.getByText('Os dados salvos estão ilegíveis')).toBeVisible();
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('{conteudo quebrado');

    const waiting = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Baixar: Dados salvos neste navegador' }).click();
    expect(readFileSync(await (await waiting).path(), 'utf8')).toBe('{conteudo quebrado');

    await page.getByRole('button', { name: 'Começar um workspace novo…' }).click();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    expect(await page.evaluate((key) => localStorage.getItem(key), KEY)).toBe('{conteudo quebrado');

    await page.getByRole('button', { name: 'Começar um workspace novo…' }).click();
    await page.getByRole('button', { name: 'Confirmar: começar com workspace vazio' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Alpha7 Performance' })).toBeVisible();
    const snapshot = await page.evaluate(() => JSON.parse(localStorage.getItem('alpha7.workspace.v1.snapshot') ?? '{}') as { previousRaw: string });
    expect(snapshot.previousRaw).toBe('{conteudo quebrado');
  });
});
