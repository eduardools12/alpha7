import { expect, test as base, type Page } from '@playwright/test';

/**
 * O aplicativo não abre mais direto na demonstração: sem dados, pergunta como começar. Os testes de
 * navegador que querem a base de demonstração passam pela escolha de verdade (clicando no botão) toda
 * vez que `page.goto` cai na tela de primeira utilização, e recarregam a página em seguida para seguir
 * como um carregamento normal de dados existentes. Os testes dessa tela usam `@playwright/test`
 * diretamente (e2e/startup.spec.ts), sem este atalho.
 */
export async function passFirstUseChoice(page: Page) {
  const heading = page.getByRole('heading', { level: 1 }).first();
  await expect(heading).toBeVisible();
  if ((await heading.textContent()) === 'Como você quer começar?') {
    await page.getByRole('button', { name: 'Começar com dados de demonstração' }).click();
    await expect(heading).not.toHaveText('Como você quer começar?');
    await page.reload();
    await expect(heading).toBeVisible();
  }
}

export const test = base.extend({
  page: async ({ page }, use) => {
    const goto = page.goto.bind(page);
    page.goto = async (url, options) => {
      const response = await goto(url, options);
      await passFirstUseChoice(page);
      // A entrada suave dos blocos (0,3 s) mede errado o contraste e o layout se a medição começar no meio dela.
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
      return response;
    };
    await use(page);
  },
});

export { expect };
