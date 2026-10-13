import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Auditoria automática (axe-core) de WCAG 2.0/2.1 A e AA: contraste, nomes acessíveis,
 * papéis ARIA, rótulos. Não substitui teste manual com leitor de tela e teclado.
 */
const ROUTES = [
  '/',
  '/elenco',
  '/elenco/demo-p-08',
  '/elenco/demo-p-18',
  '/elenco/novo',
  '/elenco/demo-p-08/editar',
  '/elenco/demo-p-08/avaliar',
  '/escalacoes',
  '/escalacoes/demo-l-01',
  '/escalacoes/nova',
  '/treinos',
  '/partidas',
  '/estatisticas',
  '/configuracoes',
  '/rota-inexistente',
];

async function audit(page: Page, route: string) {
  await page.goto(route);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const summary = results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    nodes: v.nodes.slice(0, 4).map((n) => `${n.target.join(' ')} :: ${n.failureSummary?.split('\n')[1] ?? ''}`),
  }));
  expect(summary, `violações de acessibilidade em ${route}`).toEqual([]);
}

test.describe('acessibilidade (axe) no desktop', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  for (const route of ROUTES) test(route, async ({ page }) => audit(page, route));
});

test.describe('acessibilidade (axe) no celular', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  for (const route of ROUTES) test(route, async ({ page }) => audit(page, route));
});

test('menu "Mais" aberto no celular também passa na auditoria', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Mais' }).click();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.map((v) => v.id)).toEqual([]);
});
