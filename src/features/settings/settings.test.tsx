import { screen, within } from '@testing-library/react';
import { emptyWorkspace, renderApp } from '@/test/renderApp';

async function openWeights(path = '/configuracoes') {
  const utils = renderApp({ path });
  await screen.findByRole('heading', { level: 1, name: 'Configurações' });
  return utils;
}

describe('Pesos do Overall', () => {
  it('mostra os pesos provisórios por posição, com aviso de que são escolha de modelagem', async () => {
    await openWeights();
    expect(screen.getByText('Pesos provisórios')).toBeInTheDocument();
    expect(screen.getByText(/não uma classificação científica universal/)).toBeInTheDocument();
    // Ponteiro é a posição inicial: ATA 22, REC 22, SAC 12
    expect(screen.getByLabelText(/Ataque ATA/)).toHaveValue('22');
    expect(screen.getByLabelText(/Recepção REC/)).toHaveValue('22');
    expect(screen.getByLabelText(/Levantamento LEV/)).toHaveValue('0');
  });

  it('trocar de posição mostra os pesos daquela posição', async () => {
    const { user } = await openWeights();
    await user.click(screen.getByRole('button', { name: 'Central' }));
    expect(screen.getByLabelText(/Bloqueio BLQ/)).toHaveValue('36');
  });

  it('alterar pesos e salvar recalcula o Overall nos perfis', async () => {
    const { user } = await openWeights();
    // Ponteiro: tudo zero, exceto SAC=100 => Overall do Gabriel passa a ser o próprio saque (85)
    for (const key of ['Recepção REC', 'Ataque ATA', 'Bloqueio BLQ', 'Defesa DEF', 'Velocidade e agilidade VEL', 'Impulsão IMP', 'Leitura de jogo LEI']) {
      const input = screen.getByLabelText(new RegExp(key));
      await user.clear(input);
      await user.type(input, '0');
    }
    const sac = screen.getByLabelText(/Saque SAC/);
    await user.clear(sac);
    await user.type(sac, '100');
    await user.click(screen.getByRole('button', { name: 'Salvar pesos' }));
    expect(await screen.findByText('Pesos salvos. Os Overalls foram recalculados com eles.')).toBeInTheDocument();

    await user.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: 'Elenco' }));
    // Gabriel: SAC 85; antes o Overall era 85 (coincidência?) -> use Felipe (#5, oposto) que não mudou, e André (#3 ponteiro, SAC 66)
    expect(await screen.findByRole('link', { name: 'André N., camisa 3, Ponteiro, Overall 66' })).toBeInTheDocument();
    // Oposto não foi alterado: Felipe continua com o Overall padrão
    expect(screen.getByRole('link', { name: /Felipe B\., camisa 5, Oposto, Overall 77/ })).toBeInTheDocument();
  });

  it('só a proporção importa: o total mostrado acompanha a soma dos pesos', async () => {
    const { user } = await openWeights();
    expect(screen.getByRole('row', { name: /Soma dos pesos 100/ })).toBeInTheDocument();
    const sac = screen.getByLabelText(/Saque SAC/);
    await user.clear(sac);
    await user.type(sac, '22');
    expect(screen.getByRole('row', { name: /Soma dos pesos 110/ })).toBeInTheDocument();
  });

  it('valor inválido (texto, negativo ou acima de 100) bloqueia o salvamento com mensagem', async () => {
    const { user } = await openWeights();
    const save = screen.getByRole('button', { name: 'Salvar pesos' });
    const ata = screen.getByLabelText(/Ataque ATA/);

    for (const bad of ['abc', '-5', '101', '']) {
      await user.clear(ata);
      if (bad) await user.type(ata, bad);
      expect(screen.getByText('Use um número de 0 a 100.')).toBeInTheDocument();
      expect(ata).toHaveAttribute('aria-invalid', 'true');
      expect(save).toBeDisabled();
    }
    await user.clear(ata);
    await user.type(ata, '30');
    expect(screen.queryByText('Use um número de 0 a 100.')).not.toBeInTheDocument();
    expect(save).toBeEnabled();
  });

  it('todos os pesos de uma posição em zero são recusados', async () => {
    const { user } = await openWeights();
    await user.click(screen.getByRole('button', { name: 'Líbero' }));
    for (const key of ['Recepção REC', 'Levantamento LEV', 'Defesa DEF', 'Velocidade e agilidade VEL', 'Leitura de jogo LEI']) {
      const input = screen.getByLabelText(new RegExp(key));
      await user.clear(input);
      await user.type(input, '0');
    }
    expect(screen.getByText('Pelo menos um atributo precisa ter peso maior que zero.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar pesos' })).toBeDisabled();
  });

  it('"Restaurar pesos padrão" só fica ativo quando há diferença', async () => {
    const { user } = await openWeights();
    const restore = screen.getByRole('button', { name: 'Restaurar pesos padrão' });
    expect(restore).toBeDisabled();
    const sac = screen.getByLabelText(/Saque SAC/);
    await user.clear(sac);
    await user.type(sac, '50');
    expect(restore).toBeEnabled();
    await user.click(restore);
    expect(screen.getByLabelText(/Saque SAC/)).toHaveValue('12');
  });

  it('os pesos salvos persistem no armazenamento', async () => {
    const { user, storage } = await openWeights();
    const sac = screen.getByLabelText(/Saque SAC/);
    await user.clear(sac);
    await user.type(sac, '50');
    await user.click(screen.getByRole('button', { name: 'Salvar pesos' }));
    await screen.findByText(/Pesos salvos/);
    const saved = JSON.parse(storage.map.get('alpha7.workspace.v1') ?? '{}') as {
      settings: { weights: { ponteiro: { SAC: number } } };
    };
    expect(saved.settings.weights.ponteiro.SAC).toBe(50);
  });
});

describe('Dados e armazenamento', () => {
  it('apagar tudo pede confirmação, avisa que é irreversível e esvazia o elenco', async () => {
    const { user } = await openWeights();
    await user.click(screen.getByRole('button', { name: 'Apagar todos os dados' }));
    expect(screen.getByText('Esta ação não pode ser desfeita')).toBeInTheDocument();
    expect(screen.getByText(/Os pesos do Overall são mantidos/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar: apagar todos os dados' }));
    expect(await screen.findByText('Todos os dados foram apagados.')).toBeInTheDocument();
    expect(screen.getByText(/0 atletas \(0 de demonstração\), 0 avaliações e 0 escalações/)).toBeInTheDocument();
    // o banner de demonstração some junto
    expect(screen.queryByText('Dados de demonstração', { selector: 'strong' })).not.toBeInTheDocument();
  });

  it('cancelar a confirmação não apaga nada', async () => {
    const { user } = await openWeights();
    await user.click(screen.getByRole('button', { name: 'Apagar todos os dados' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText(/18 atletas \(18 de demonstração\)/)).toBeInTheDocument();
    expect(screen.queryByText('Esta ação não pode ser desfeita')).not.toBeInTheDocument();
  });

  it('restaurar a demonstração substitui os dados atuais, depois de confirmar', async () => {
    const { user } = renderApp({ path: '/configuracoes', workspace: emptyWorkspace() });
    await screen.findByRole('heading', { level: 1, name: 'Configurações' });
    expect(screen.getByText(/0 atletas/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Restaurar dados de demonstração' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar: substituir tudo pela demonstração' }));
    expect(await screen.findByText('Dados de demonstração restaurados.')).toBeInTheDocument();
    expect(screen.getByText(/18 atletas \(18 de demonstração\)/)).toBeInTheDocument();
  });

  it('exibe os arquivos oficiais de logo e uniformes preservados', async () => {
    await openWeights();
    expect(screen.getByRole('img', { name: 'Logo oficial do Alpha7' })).toHaveAttribute('src', '/brand/original/a7-logo.jpeg');
    expect(screen.getByRole('img', { name: /Uniforme branco/ })).toHaveAttribute('src', '/brand/original/a7-branco.jpeg');
    expect(screen.getByRole('img', { name: /Uniforme roxo/ })).toHaveAttribute('src', '/brand/original/a7-roxo.jpeg');
  });
});
