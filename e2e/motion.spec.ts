import { expect, test } from './fixtures';

/** Movimento: a entrada suave existe e respeita prefers-reduced-motion; o registro de pontos não depende de animação. */
test.describe('movimento padrão', () => {
  test('os blocos do dashboard entram com animação curta', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const name = await page.evaluate(() => getComputedStyle(document.querySelector('.enter') as Element).animationName);
    expect(name).toBe('a7-enter');
  });
});

test.describe('movimento reduzido', () => {
  test.use({ reducedMotion: 'reduce' });

  test('sem animação de entrada e sem transições longas nas telas principais', async ({ page }) => {
    for (const route of ['/', '/elenco', '/partidas', '/estatisticas']) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const result = await page.evaluate(() => {
        const entering = [...document.querySelectorAll('.enter')].map((el) => getComputedStyle(el).animationName);
        const transitions = [...document.querySelectorAll('a, button')].slice(0, 40).map((el) => getComputedStyle(el).transitionDuration);
        return { entering, longTransitions: transitions.filter((t) => t.split(',').some((d) => parseFloat(d) > 0.001)) };
      });
      expect(result.entering.every((n) => n === 'none'), `animação em ${route}`).toBe(true);
      expect(result.longTransitions, `transições em ${route}`).toEqual([]);
    }
  });

  test('o registro de um ponto responde sem esperar animação', async ({ page }) => {
    await page.goto('/partidas/nova');
    await page.getByLabel('Adversário').fill('Time Movimento');
    await page.getByLabel('Quantidade de sets').selectOption('1');
    await page.getByLabel('Pontos de cada set').fill('5');
    await page.getByLabel('Escalação salva (opcional)').selectOption({ label: 'Escalação de exemplo' });
    await page.getByRole('button', { name: 'Cadastrar partida' }).click();
    await page.getByRole('link', { name: 'Iniciar' }).first().click();
    await page.getByRole('button', { name: 'Iniciar set 1' }).click();
    const start = Date.now();
    await page.getByRole('button', { name: 'Ponto do Alpha7' }).click();
    await expect(page.getByLabel('Alpha7: 1 pontos')).toBeVisible();
    expect(Date.now() - start).toBeLessThan(2000);
  });
});
