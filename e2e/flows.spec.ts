import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1280, height: 800 } });

test.describe('fluxos principais no navegador real', () => {
  test('cadastrar atleta com avaliação, ver no elenco e manter após recarregar', async ({ page }) => {
    await page.goto('/elenco/novo');
    await page.getByLabel('Nome completo').fill('Rui Teixeira');
    await page.getByLabel('Número da camisa').fill('40');
    await page.getByLabel('Posição principal').selectOption('oposto');
    await page.getByLabel(/Registrar a primeira avaliação agora/).check();
    await page.getByLabel('Quem avaliou').fill('Coach E2E');
    await page.getByLabel('Ataque ATA').fill('90');
    await page.getByRole('button', { name: 'Cadastrar atleta' }).click();

    await expect(page.getByText('Atleta cadastrado.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Rui Teixeira' })).toBeVisible();

    await page.reload();
    await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('link', { name: 'Elenco' }).click();
    await expect(page.getByText('19 jogadores')).toBeVisible();
    await expect(page.getByRole('link', { name: /Rui T\., camisa 40, Oposto, Overall \d+/ })).toBeVisible();
  });

  test('busca e filtros do elenco funcionam e ficam na URL', async ({ page }) => {
    await page.goto('/elenco');
    await page.getByLabel('Buscar por nome ou número').fill('lucas');
    await expect(page.getByText('1 de 18 jogadores')).toBeVisible();
    await expect(page).toHaveURL(/q=lucas/);
    await page.getByLabel('Buscar por nome ou número').fill('');
    await page.getByRole('button', { name: 'Central' }).click();
    await expect(page.getByText('4 de 18 jogadores')).toBeVisible();
    await expect(page).toHaveURL(/posicao=central/);
  });

  test('registrar avaliação mantém o histórico e atualiza o Overall', async ({ page }) => {
    await page.goto('/elenco/demo-p-08/avaliar');
    await page.getByLabel('Recepção REC').fill('99');
    await page.getByLabel('Quem avaliou').fill('Coach E2E');
    await page.getByRole('button', { name: 'Salvar avaliação' }).click();
    await expect(page.getByRole('img', { name: 'Overall 89' })).toBeVisible();
    const history = page.getByRole('heading', { name: 'Histórico de avaliações' }).locator('xpath=ancestor::section[1]');
    await expect(history.getByRole('listitem')).toHaveCount(7);
  });

  test('montar escalação com o mouse, sem duplicar, e salvar', async ({ page }) => {
    await page.goto('/escalacoes/nova');
    const pick = async (zone: number, name: string) => {
      const button = page.getByRole('button', { name: new RegExp(`^Zona P${zone}`) });
      if ((await button.getAttribute('aria-pressed')) !== 'true') await button.click();
      await page.getByRole('button', { name: `Escolher: ${name}` }).click();
    };
    await page.getByLabel('Nome da escalação').fill('Escalação E2E');
    await pick(1, 'Lucas M.');
    await pick(2, 'Gabriel S.');
    await pick(3, 'Pedro A.');
    await pick(4, 'Felipe B.');
    await pick(5, 'Murilo V.');
    await pick(6, 'Lucas M.'); // já estava em P1: move, deixando P1 vazio
    await expect(page.getByText('5 de 6 titulares')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Salvar escalação' })).toBeDisabled();
    await pick(1, 'Matheus C.');
    await expect(page.getByText('6 de 6 titulares')).toBeVisible();
    await page.getByRole('button', { name: 'Salvar escalação' }).click();
    await expect(page.getByText('Escalação salva.')).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: /^Zona P6/ })).toHaveAccessibleName(/Lucas M\./);
  });

  test('o Overall muda quando os pesos mudam e o dado persiste', async ({ page }) => {
    await page.goto('/configuracoes');
    await page.getByLabel(/Saque SAC/).fill('100');
    for (const key of ['Recepção REC', 'Ataque ATA', 'Bloqueio BLQ', 'Defesa DEF', 'Velocidade e agilidade VEL', 'Impulsão IMP', 'Leitura de jogo LEI']) {
      await page.getByLabel(new RegExp(key)).fill('0');
    }
    await page.getByRole('button', { name: 'Salvar pesos' }).click();
    await expect(page.getByText(/Pesos salvos/)).toBeVisible();
    await page.goto('/elenco');
    await expect(page.getByRole('link', { name: 'André N., camisa 3, Ponteiro, Overall 66' })).toBeVisible();
  });

  test('apagar todos os dados leva aos estados vazios', async ({ page }) => {
    await page.goto('/configuracoes');
    await page.getByRole('button', { name: 'Apagar todos os dados' }).click();
    await page.getByRole('button', { name: 'Confirmar: apagar todos os dados' }).click();
    await expect(page.getByText('Todos os dados foram apagados.')).toBeVisible();
    await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('link', { name: 'Dashboard' }).click();
    await expect(page.getByText('Ainda não há dados da equipe')).toBeVisible();
  });
});
