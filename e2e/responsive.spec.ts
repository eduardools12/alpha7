import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  '/',
  '/elenco',
  '/elenco/demo-p-08',
  '/elenco/novo',
  '/elenco/demo-p-08/avaliar',
  '/escalacoes',
  '/escalacoes/demo-l-01',
  '/treinos',
  '/treinos/novo',
  '/treinos/demo-t-01',
  '/treinos/demo-t-01/editar',
  '/treinos/demo-t-04/registrar',
  '/configuracoes',
];

const VIEWPORTS = [
  { name: 'celular pequeno', width: 360, height: 740, desktop: false },
  { name: 'celular', width: 390, height: 844, desktop: false },
  { name: 'tablet', width: 768, height: 1024, desktop: false },
  { name: 'notebook', width: 1280, height: 800, desktop: true },
  { name: 'tela larga', width: 1920, height: 1080, desktop: true },
];

async function open(page: Page, route: string) {
  await page.goto(route);
  await expect(page.getByRole('main')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // fontes e gráficos assentados antes de medir
  await page.evaluate(() => document.fonts.ready);
}

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name} (${viewport.width}px)`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('nenhuma tela tem rolagem horizontal', async ({ page }) => {
      for (const route of ROUTES) {
        await open(page, route);
        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }));
        expect(overflow.scrollWidth, `rolagem horizontal em ${route}`).toBeLessThanOrEqual(overflow.clientWidth);
      }
    });

    test(`mostra ${viewport.desktop ? 'o menu lateral' : 'a barra inferior'} e esconde o outro`, async ({ page }) => {
      await open(page, '/');
      const side = page.getByRole('navigation', { name: 'Principal', exact: true });
      const bottom = page.getByRole('navigation', { name: 'Principal, celular' });
      if (viewport.desktop) {
        await expect(side).toBeVisible();
        await expect(bottom).toBeHidden();
      } else {
        await expect(bottom).toBeVisible();
        await expect(side).toBeHidden();
      }
    });
  });
}

test.describe('celular: usabilidade', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('alvos de toque da navegação têm pelo menos 44px', async ({ page }) => {
    await open(page, '/');
    const items = page.getByRole('navigation', { name: 'Principal, celular' }).locator('a, button');
    const count = await items.count();
    expect(count).toBe(5);
    for (let i = 0; i < count; i++) {
      const box = await items.nth(i).boundingBox();
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    }
  });

  test('a barra inferior não cobre o fim do conteúdo', async ({ page }) => {
    await open(page, '/elenco');
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const lastCard = page.getByRole('link', { name: /camisa 18/ });
    const cardBox = await lastCard.boundingBox();
    const barBox = await page.getByRole('navigation', { name: 'Principal, celular' }).boundingBox();
    expect(cardBox && barBox && cardBox.y + cardBox.height <= barBox.y + 1).toBe(true);
  });

  test('o menu "Mais" abre acima da barra e leva às demais telas', async ({ page }) => {
    await open(page, '/');
    await page.getByRole('button', { name: 'Mais' }).click();
    const item = page.getByRole('link', { name: 'Configurações' });
    await expect(item).toBeVisible();
    await item.click();
    await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Configurações' })).toBeHidden(); // menu fechou
  });

  test('o editor de escalação cabe na tela: quadra e zonas legíveis', async ({ page }) => {
    await open(page, '/escalacoes/demo-l-01');
    const zones = page.getByRole('button', { name: /^Zona P/ });
    await expect(zones).toHaveCount(6);
    for (let i = 0; i < 6; i++) {
      const box = await zones.nth(i).boundingBox();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(80);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(80);
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(390);
    }
  });

  test('registro rápido: botões de resultado grandes e sempre acima da barra inferior depois de escolher o jogador', async ({ page }) => {
    await open(page, '/treinos/demo-t-04/registrar');
    await page.getByRole('button', { name: /Gabriel S\., camisa 8/ }).click();
    await page.getByRole('group', { name: 'Fundamento' }).getByRole('button', { name: 'Recepção' }).click();

    const outcomes = page.getByRole('button', { name: /^(A|B|C|Erro), / });
    await expect(outcomes).toHaveCount(4);
    const nav = await page.getByRole('navigation', { name: 'Principal, celular' }).boundingBox();
    for (let i = 0; i < 4; i++) {
      const box = await outcomes.nth(i).boundingBox();
      expect(box?.height ?? 0, 'altura do botão').toBeGreaterThanOrEqual(56);
      expect(box?.width ?? 0, 'largura do botão').toBeGreaterThanOrEqual(120);
      expect((box?.y ?? 0) + (box?.height ?? 0), 'botão acima da barra inferior').toBeLessThanOrEqual((nav?.y ?? 0) + 1);
    }
    // continua assim depois de rolar até o fim da página
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const last = await outcomes.nth(3).boundingBox();
    expect((last?.y ?? 0) + (last?.height ?? 0)).toBeLessThanOrEqual((nav?.y ?? 0) + 1);
  });

  test('registro rápido: alvos de toque de jogadores e fundamentos têm pelo menos 44px', async ({ page }) => {
    await open(page, '/treinos/demo-t-04/registrar');
    for (const locator of [
      page.getByRole('group', { name: 'Jogador' }).getByRole('button'),
      page.getByRole('group', { name: 'Fundamento' }).getByRole('button'),
      page.getByRole('group', { name: 'Exercício atual' }).getByRole('button'),
    ]) {
      const count = await locator.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i++) {
        const box = await locator.nth(i).boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
        expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      }
    }
  });

  test('cartas do elenco ocupam a largura sem estourar', async ({ page }) => {
    await open(page, '/elenco');
    const card = page.getByRole('link', { name: /Gabriel S\./ });
    const box = await card.boundingBox();
    expect(box && box.x >= 0 && box.x + box.width <= 390).toBe(true);
  });
});

test.describe('acessibilidade básica', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('o primeiro Tab leva ao link de pular para o conteúdo, que vira visível', async ({ page }) => {
    await open(page, '/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Pular para o conteúdo' });
    await expect(skip).toBeFocused();
    const box = await skip.boundingBox();
    expect(box && box.y >= 0).toBe(true);
  });

  test('o foco do teclado é visível nos controles', async ({ page }) => {
    await open(page, '/elenco');
    await page.getByRole('button', { name: 'Central' }).focus();
    const outline = await page.getByRole('button', { name: 'Central' }).evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');
  });

  test('respeita prefers-reduced-motion: sem animações longas', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', baseURL: 'http://localhost:5174' });
    const page = await context.newPage();
    await page.goto('/elenco');
    const duration = await page.getByRole('link', { name: /Gabriel S\./ }).evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(parseFloat(duration)).toBeLessThan(0.01);
    await context.close();
  });
});
