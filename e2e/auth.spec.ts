import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Login em navegador real, com o backend Supabase habilitado mas apontando para um endereço inexistente
 * (ver playwright.config.ts): nenhum dado real é tocado. Valida a tela, a acessibilidade, o layout e o tratamento
 * de uma falha de rede de verdade. O login com conta real e as políticas RLS NÃO são testados aqui.
 */
test.use({ viewport: { width: 1280, height: 800 } });

const heading = (page: Page, name: string) => page.getByRole('heading', { level: 2, name });

const overflowing = (page: Page) =>
  page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    return [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > width + 1 && el.getBoundingClientRect().width > 0)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} (${Math.round(el.getBoundingClientRect().right)}px)`);
  });

const audit = async (page: Page, label: string) => {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')} :: ${v.nodes[0]?.any[0]?.message ?? ''}`), label).toEqual([]);
};

test.describe('login com o backend Supabase', () => {
  test('sem sessão, qualquer endereço mostra o login e nada do aplicativo', async ({ page }) => {
    for (const route of ['/', '/elenco', '/configuracoes', '/treinos/novo']) {
      await page.goto(route);
      await expect(heading(page, 'Entrar')).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Principal' })).toHaveCount(0);
    }
    await expect(page.getByText(/criar conta|cadastre-se/i)).toHaveCount(0);
    await expect(page.getByText(/acesso é por convite/i)).toBeVisible();
  });

  test('valida os campos e leva o foco ao primeiro erro', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText('Informe um e-mail válido.')).toBeVisible();
    await expect(page.getByText('Informe a senha.')).toBeVisible();
    await expect(page.getByLabel('E-mail')).toBeFocused();
  });

  test('falha de rede de verdade: mensagem de conexão, e não de senha errada', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('E-mail').fill('pessoa@exemplo.com');
    await page.getByLabel('Senha').fill('qualquer-senha');
    await page.getByRole('button', { name: 'Entrar' }).click();
    await expect(page.getByText(/Sem conexão com o servidor/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('E-mail ou senha incorretos.')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });

  test('recuperação de senha: valida o e-mail e mostra a falha de conexão', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
    await expect(heading(page, 'Redefinir senha')).toBeVisible();
    await page.getByRole('button', { name: 'Enviar link de redefinição' }).click();
    await expect(page.getByText('Informe um e-mail válido.')).toBeVisible();
    await page.getByLabel('E-mail').fill('pessoa@exemplo.com');
    await page.getByRole('button', { name: 'Enviar link de redefinição' }).click();
    await expect(page.getByText(/Sem conexão com o servidor/)).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Voltar ao login' }).click();
    await expect(heading(page, 'Entrar')).toBeVisible();
  });

  test('os dados locais do navegador não são lidos nem alterados pelo backend remoto', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('alpha7.workspace.v1', 'DADOS-LOCAIS-INTACTOS'));
    await page.reload();
    await expect(heading(page, 'Entrar')).toBeVisible();
    await page.getByRole('button', { name: 'Entrar' }).click();
    expect(await page.evaluate(() => localStorage.getItem('alpha7.workspace.v1'))).toBe('DADOS-LOCAIS-INTACTOS');
    await expect(page.getByRole('heading', { name: 'Como você quer começar?' })).toHaveCount(0);
  });

  for (const size of [{ width: 1280, height: 800 }, { width: 360, height: 740 }]) {
    test(`login e recuperação passam na auditoria e cabem na tela (${size.width}px)`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.goto('/');
      await expect(heading(page, 'Entrar')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await audit(page, 'login');
      expect(await overflowing(page), 'passa da borda no login').toEqual([]);

      await page.getByRole('button', { name: 'Entrar' }).click(); // com os erros de validação visíveis
      await expect(page.getByText('Informe um e-mail válido.')).toBeVisible();
      await audit(page, 'login com erros');

      await page.getByRole('button', { name: 'Esqueci minha senha' }).click();
      await expect(heading(page, 'Redefinir senha')).toBeVisible();
      await audit(page, 'recuperação de senha');
      expect(await overflowing(page), 'passa da borda na recuperação').toEqual([]);
    });
  }
});
