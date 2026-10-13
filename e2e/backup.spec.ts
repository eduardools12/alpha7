import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import type { Download, Page } from '@playwright/test';
import { expect, test } from './fixtures';

test.use({ viewport: { width: 1280, height: 900 } });

const goSettings = async (page: Page) => {
  await page.goto('/configuracoes');
  await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible();
};

async function exportBackup(page: Page): Promise<{ download: Download; text: string }> {
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup', exact: true }).click();
  const download = await waiting;
  return { download, text: readFileSync(await download.path(), 'utf8') };
}

/** Abre o Elenco pelo menu e confere quantos jogadores há. */
const expectRoster = async (page: Page, count: number) => {
  await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('link', { name: 'Elenco' }).click();
  await expect(page.getByText(`${count} ${count === 1 ? 'jogador' : 'jogadores'}`, { exact: true })).toBeVisible();
};

test.describe('backup e restauração no navegador real', () => {
  test('exportar baixa um arquivo JSON de verdade, com a data no nome e o workspace inteiro', async ({ page }) => {
    await goSettings(page);
    const { download, text } = await exportBackup(page);
    expect(download.suggestedFilename()).toMatch(/^alpha7-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);

    const file = JSON.parse(text) as {
      format: string;
      formatVersion: number;
      appVersion: string;
      exportedAt: string;
      checksum: { algorithm: string; value: string };
      counts: { players: number; trainings: number };
      workspace: Record<string, unknown[]>;
    };
    expect(file).toMatchObject({ format: 'alpha7-backup', formatVersion: 1, checksum: { algorithm: 'sha256' } });
    expect(file.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(file.counts).toMatchObject({ players: 18, trainings: 4 });
    expect(Object.keys(file.workspace).sort()).toEqual(['activity', 'evaluations', 'exercises', 'lineups', 'players', 'settings', 'trainingEvents', 'trainings']);
    expect(text).not.toMatch(/secret|token|password|api[_-]?key|service_role/i);
    await expect(page.getByText(/Backup exportado: alpha7-backup-/)).toBeVisible();
  });

  test('apagar tudo e restaurar o backup devolve o workspace completo, e persiste ao recarregar', async ({ page }, testInfo) => {
    await goSettings(page);
    const { text } = await exportBackup(page);

    await page.getByRole('button', { name: 'Apagar todos os dados' }).click();
    await page.getByRole('button', { name: 'Confirmar: apagar todos os dados' }).click();
    await expect(page.getByText('Todos os dados foram apagados.')).toBeVisible();
    await expect(page.getByText(/Atualmente: 0 atletas/)).toBeVisible();

    await page.getByLabel('Arquivo de backup (.json)').setInputFiles({ name: 'meu-backup.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    const preview = page.getByRole('region', { name: 'Prévia do backup' });
    await expect(preview).toBeVisible();
    await expect(preview.getByRole('row', { name: /Atletas 18 0/ })).toBeVisible(); // backup × atual (vazio)
    await expect(preview.getByRole('row', { name: /Treinos 4 0/ })).toBeVisible();
    await preview.getByRole('checkbox', { name: /Entendi/ }).check();
    await preview.getByRole('button', { name: 'Restaurar este backup' }).click();
    await expect(page.getByText('Restauração concluída')).toBeVisible();

    await page.reload();
    await expectRoster(page, 18);
    await page.getByRole('navigation', { name: 'Principal', exact: true }).getByRole('link', { name: 'Treinos' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Transição e saque' })).toBeVisible();
    await page.getByRole('link', { name: 'Resumo' }).nth(1).click();
    await expect(page.getByRole('region', { name: 'Saque' })).toBeVisible();
    testInfo.annotations.push({ type: 'tamanho do backup', description: `${text.length} bytes` });
  });

  test('arquivo inválido é recusado e os dados não mudam', async ({ page }) => {
    await goSettings(page);
    const { text } = await exportBackup(page);
    const tampered = text.replace('"name": "Gabriel Silva"', '"name": "Outro Nome"');
    expect(tampered).not.toBe(text);

    await page.getByLabel('Arquivo de backup (.json)').setInputFiles({ name: 'adulterado.json', mimeType: 'application/json', buffer: Buffer.from(tampered) });
    await expect(page.getByText('Arquivo recusado. Nada foi alterado.')).toBeVisible();
    await expect(page.getByText(/foi alterado ou está incompleto/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restaurar este backup' })).toHaveCount(0);

    await page.getByLabel('Arquivo de backup (.json)').setInputFiles({ name: 'lixo.json', mimeType: 'application/json', buffer: Buffer.from('isto não é json') });
    await expect(page.getByText(/não é um JSON válido/)).toBeVisible();

    await expectRoster(page, 18);
    await page.getByRole('link', { name: /Gabriel S\., camisa 8/ }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Gabriel Silva' })).toBeVisible();
  });

  test('cancelar a restauração não altera nada', async ({ page }) => {
    await goSettings(page);
    const { text } = await exportBackup(page);
    await page.getByRole('button', { name: 'Apagar todos os dados' }).click();
    await page.getByRole('button', { name: 'Confirmar: apagar todos os dados' }).click();
    await expect(page.getByText('Todos os dados foram apagados.')).toBeVisible();

    await page.getByLabel('Arquivo de backup (.json)').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(text) });
    await expect(page.getByRole('region', { name: 'Prévia do backup' })).toBeVisible();
    await page.getByRole('button', { name: 'Cancelar' }).click();
    await expect(page.getByRole('region', { name: 'Prévia do backup' })).toHaveCount(0);
    await expect(page.getByText(/Atualmente: 0 atletas/)).toBeVisible();
  });

  test('desfazer a última substituição devolve o conteúdo anterior', async ({ page }) => {
    await goSettings(page);
    await page.getByRole('button', { name: 'Apagar todos os dados' }).click();
    await page.getByRole('button', { name: 'Confirmar: apagar todos os dados' }).click();
    await expect(page.getByText(/Atualmente: 0 atletas/)).toBeVisible();
    await expect(page.getByText(/Cópia de segurança da última substituição/)).toBeVisible();

    await page.reload(); // a cópia sobrevive ao recarregamento
    await page.getByRole('button', { name: 'Desfazer última substituição' }).click();
    await page.getByRole('button', { name: 'Confirmar: voltar ao conteúdo anterior' }).click();
    await expect(page.getByText(/Conteúdo anterior restaurado/)).toBeVisible();
    await expect(page.getByText(/Atualmente: 18 atletas/)).toBeVisible();
  });

  test('restaurar a demonstração exige confirmação, descreve o impacto e preserva os pesos', async ({ page }) => {
    await goSettings(page);
    await page.getByLabel(/Saque SAC/).fill('41');
    await page.getByRole('button', { name: 'Salvar pesos' }).click();
    await expect(page.getByText(/Pesos salvos/)).toBeVisible();

    await page.getByRole('button', { name: 'Restaurar dados de demonstração' }).click();
    const panel = page.getByRole('region', { name: 'Substituir tudo pela demonstração?' });
    await expect(panel.getByText(/Recomendado: exporte um backup antes/)).toBeVisible();
    await expect(panel.getByText(/Os pesos do Overall são mantidos/)).toBeVisible();
    await panel.getByRole('button', { name: 'Confirmar: substituir tudo pela demonstração' }).click();
    await expect(page.getByText('Dados de demonstração restaurados.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel(/Saque SAC/)).toHaveValue('41');
  });

  test('o lembrete aparece com dados da equipe sem backup e some depois de exportar', async ({ page }) => {
    await page.goto('/elenco/novo');
    await page.getByLabel('Nome completo').fill('Rui Teixeira');
    await page.getByLabel('Número da camisa').fill('40');
    await page.getByLabel('Posição principal').selectOption('oposto');
    await page.getByRole('button', { name: 'Cadastrar atleta' }).click();
    await expect(page.getByText('Atleta cadastrado.')).toBeVisible();
    await expect(page.getByText('Faça um backup dos dados da equipe')).toBeVisible();

    await page.getByRole('link', { name: 'Exportar backup' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Configurações' })).toBeVisible();
    await exportBackup(page);
    await expect(page.getByText('Faça um backup dos dados da equipe')).toHaveCount(0);
  });
});

test.describe('acessibilidade e layout dos painéis de backup', () => {
  const audit = async (page: Page, label: string) => {
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    expect(
      results.violations.map((v) => `${v.id}: ${v.nodes[0]?.target.join(' ')} :: ${v.nodes[0]?.any[0]?.message ?? ''}`),
      label,
    ).toEqual([]);
  };

  for (const size of [{ width: 1280, height: 900 }, { width: 360, height: 740 }]) {
    test(`prévia, recusa e confirmações passam na auditoria e não estouram a tela (${size.width}px)`, async ({ page }) => {
      await page.setViewportSize(size);
      await goSettings(page);
      const { text } = await exportBackup(page);
      /** Elementos que passam da borda direita da tela (vazio = sem rolagem horizontal). */
      const overflowing = () =>
        page.evaluate(() => {
          const width = document.documentElement.clientWidth;
          return [...document.querySelectorAll('body *')]
            .filter((el) => el.getBoundingClientRect().right > width + 1 && el.getBoundingClientRect().width > 0)
            .slice(0, 5)
            .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]} (${Math.round(el.getBoundingClientRect().right)}px)`);
        });

      await page.getByLabel('Arquivo de backup (.json)').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(text) });
      await expect(page.getByRole('region', { name: 'Prévia do backup' })).toBeVisible();
      await audit(page, 'prévia');
      expect(await overflowing(), 'passa da borda na prévia').toEqual([]);

      await page.getByLabel('Arquivo de backup (.json)').setInputFiles({ name: 'ruim.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
      await expect(page.getByText('Arquivo recusado. Nada foi alterado.')).toBeVisible();
      await audit(page, 'arquivo recusado');
      expect(await overflowing(), 'passa da borda na recusa').toEqual([]);

      await page.getByRole('button', { name: 'Apagar todos os dados' }).click();
      await expect(page.getByRole('region', { name: 'Apagar todos os dados?' })).toBeVisible();
      await audit(page, 'confirmação de apagar');
      expect(await overflowing(), 'passa da borda na confirmação').toEqual([]);

      await page.getByRole('button', { name: 'Cancelar' }).click();
      await page.getByRole('button', { name: 'Verificar integridade dos dados' }).click();
      await expect(page.getByText(/Nenhum problema encontrado/)).toBeVisible();
      await audit(page, 'integridade');
    });
  }
});
