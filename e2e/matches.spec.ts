import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

/**
 * Partidas no navegador real (backend local): cadastro, início do set com a formação salva, pontos, fechamento do
 * set, encerramento, persistência após recarregar, responsividade, alvos de toque e acessibilidade.
 */
async function createMatch(page: Page, opponent: string) {
  await page.goto('/partidas/nova');
  await page.getByLabel('Adversário').fill(opponent);
  await page.getByLabel('Campeonato ou amistoso (opcional)').fill('Copa E2E');
  await page.getByLabel('Quantidade de sets').selectOption('1');
  await page.getByLabel('Pontos de cada set').fill('5');
  await page.getByLabel('Escalação salva (opcional)').selectOption({ label: 'Escalação de exemplo' });
  await page.getByRole('button', { name: 'Cadastrar partida' }).click();
  await expect(page.getByText('Partida cadastrada.')).toBeVisible();
}

async function startLive(page: Page) {
  await page.getByRole('link', { name: 'Iniciar' }).first().click();
  await expect(page.getByText('Iniciar o set 1')).toBeVisible();
  await page.getByRole('button', { name: 'Iniciar set 1' }).click();
  await expect(page.getByRole('button', { name: 'Ponto do Alpha7' })).toBeVisible();
}

const noHorizontalScroll = async (page: Page, where: string) => {
  const overflow = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(overflow.scroll, `rolagem horizontal em ${where}`).toBeLessThanOrEqual(overflow.client);
};

const audit = async (page: Page, where: string) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')}`), `acessibilidade em ${where}`).toEqual([]);
};

test.describe('partida completa no desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('cadastrar, acompanhar até fechar o set, encerrar e manter o resultado após recarregar', async ({ page }) => {
    await createMatch(page, 'Time E2E');
    await expect(page.getByRole('heading', { name: 'Alpha7 x Time E2E' })).toBeVisible();
    await startLive(page);
    await expect(page.getByText(/Saca agora:/)).toBeVisible();

    await page.getByRole('region', { name: 'Ponto do Alpha7' }).getByRole('button', { name: 'Ace' }).click();
    await expect(page.getByLabel('Alpha7: 1 pontos')).toBeVisible();
    await page.getByRole('button', { name: 'Ponto do adversário' }).click();
    await expect(page.getByLabel('Time E2E: 1 pontos')).toBeVisible();
    await audit(page, 'acompanhamento (desktop)');
    for (let i = 0; i < 4; i += 1) await page.getByRole('button', { name: 'Ponto do Alpha7' }).click();
    await expect(page.getByText('Set 1 encerrado: 5 x 1')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ponto do Alpha7' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Encerrar partida' }).click();
    await page.getByRole('button', { name: 'Confirmar encerramento' }).click();
    await expect(page.getByText('Esta partida está concluída')).toBeVisible();

    await page.goto('/partidas');
    const card = page.getByRole('article').filter({ hasText: 'Time E2E' });
    await expect(card.getByText('Concluída')).toBeVisible();
    await expect(card.getByText('1 x 0')).toBeVisible();
    await expect(card.getByText('Vitória')).toBeVisible();

    await card.getByRole('link', { name: 'Detalhes' }).click();
    await expect(page.getByRole('heading', { name: 'Motivos dos pontos' })).toBeVisible();
    await expect(page.getByText('5 x 1', { exact: true }).first()).toBeVisible();
    await audit(page, 'detalhes da partida (desktop)');
  });

  test('desfazer o último ponto reabre o set e o dado sobrevive ao recarregar a página', async ({ page }) => {
    await createMatch(page, 'Time Desfazer');
    await startLive(page);
    for (let i = 0; i < 5; i += 1) await page.getByRole('button', { name: 'Ponto do Alpha7' }).click();
    await expect(page.getByText('Set 1 encerrado: 5 x 0')).toBeVisible();
    await page.getByRole('button', { name: 'Desfazer último ponto' }).click();
    await expect(page.getByLabel('Alpha7: 4 pontos')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Alpha7: 4 pontos')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Ponto do Alpha7' })).toBeVisible();
  });
});

for (const viewport of [
  { name: 'celular pequeno', width: 360, height: 740 },
  { name: 'celular', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
]) {
  test.describe(`acompanhamento no ${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('sem rolagem horizontal, alvos de toque de 44px e auditoria de acessibilidade', async ({ page }) => {
      await createMatch(page, 'Time Celular');
      await noHorizontalScroll(page, 'lista de partidas');
      await startLive(page);
      await noHorizontalScroll(page, 'acompanhamento');
      for (const name of ['Ponto do Alpha7', 'Ponto do adversário', 'Desfazer último ponto']) {
        const box = await page.getByRole('button', { name }).boundingBox();
        expect(box, name).not.toBeNull();
        expect(box?.height ?? 0, `${name}: altura do alvo de toque`).toBeGreaterThanOrEqual(44);
        expect(box?.width ?? 0, `${name}: largura do alvo de toque`).toBeGreaterThanOrEqual(44);
      }
      for (const reason of ['Ace', 'Ataque vencedor']) {
        const box = await page.getByRole('region', { name: 'Ponto do Alpha7' }).getByRole('button', { name: reason }).boundingBox();
        expect(box?.height ?? 0, `${reason}: altura do alvo de toque`).toBeGreaterThanOrEqual(44);
      }
      await page.getByRole('button', { name: 'Ponto do Alpha7' }).click();
      await expect(page.getByLabel('Alpha7: 1 pontos')).toBeVisible();
      await audit(page, `acompanhamento (${viewport.width}px)`);
      await page.getByRole('link', { name: 'Detalhes da partida' }).click();
      await expect(page.getByRole('heading', { name: 'Histórico dos pontos' })).toBeVisible();
      await noHorizontalScroll(page, 'detalhes da partida');
      await audit(page, `detalhes da partida (${viewport.width}px)`);
    });
  });
}
