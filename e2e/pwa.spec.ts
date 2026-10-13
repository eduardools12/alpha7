import { expect, test } from './fixtures';

/**
 * Aplicativo instalável em navegador real, contra o BUILD de produção servido por `vite preview` (porta 5176): o service
 * worker só existe nele. Dados no modo local. Não cobre o pedido de instalação nem o ícone na tela inicial (dependem do
 * sistema operacional e foram verificados à parte: manifesto e ícones nos testes de unidade).
 */
const dashboard = (page: import('@playwright/test').Page) => page.getByRole('heading', { level: 1, name: 'Alpha7 Performance' });

test('manifesto e service worker são servidos com o tipo certo e sem cache no service worker', async ({ request }) => {
  const manifest = await request.get('/manifest.webmanifest');
  expect(manifest.ok()).toBe(true);
  expect(manifest.headers()['content-type']).toContain('json');
  expect((await manifest.json()).short_name).toBe('Alpha7');

  const worker = await request.get('/sw.js');
  expect(worker.ok()).toBe(true);
  expect(worker.headers()['content-type']).toContain('javascript');
  expect(await worker.text()).toContain('alpha7-shell-');
});

test('depois da primeira visita, o aplicativo abre e navega sem internet', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await expect(dashboard(page)).toBeVisible();

  // Espera o service worker instalar e assumir a página (o primeiro carregamento ainda não é controlado).
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
  await expect(dashboard(page)).toBeVisible();

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(dashboard(page)).toBeVisible();

    // Um endereço de tela aberto direto, também sem rede, cai na casca do app e abre a tela certa.
    // Todas são carregadas sob demanda: provam que cada pedaço foi guardado na instalação (inclui gráficos e Configurações).
    for (const [route, title] of [
      ['/partidas', 'Partidas'],
      ['/treinos', 'Treinos'],
      ['/escalacoes', 'Escalações'],
      ['/estatisticas', 'Estatísticas'],
      ['/configuracoes', 'Configurações'],
    ] as const) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
    }
  } finally {
    await context.setOffline(false);
  }
});

test('sem internet, os dados locais continuam intactos e editáveis', async ({ page, context }) => {
  test.setTimeout(120_000);
  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);

  await context.setOffline(true);
  try {
    await page.goto('/partidas/nova');
    await page.getByLabel('Adversário').fill('Time Sem Rede');
    await page.getByRole('button', { name: 'Cadastrar partida' }).click();
    await expect(page.getByText('Partida cadastrada.')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Alpha7 x Time Sem Rede' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('Configurações mostra a instalação e explica o que funciona sem internet', async ({ page }) => {
  await page.goto('/configuracoes');
  await expect(page.getByRole('heading', { level: 2, name: 'Aplicativo no celular' })).toBeVisible();
  await expect(page.getByText('O que funciona sem internet')).toBeVisible();
});
