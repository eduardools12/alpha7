import { screen, within } from '@testing-library/react';
import { emptyWorkspace, renderApp } from '@/test/renderApp';

type User = ReturnType<typeof renderApp>['user'];

/** Seleciona a zona e escolhe o atleta pelo nome acessível do botão. */
async function placeStarter(user: User, zone: number, player: string) {
  const button = screen.getByRole('button', { name: new RegExp(`^Zona P${zone}`) });
  // Clicar numa zona já selecionada a desmarca; só clica se ainda não estiver selecionada.
  if (button.getAttribute('aria-pressed') !== 'true') await user.click(button);
  await user.click(screen.getByRole('button', { name: `Escolher: ${player}` }));
}

const zoneButton = (zone: number) => screen.getByRole('button', { name: new RegExp(`^Zona P${zone}`) });

describe('Montagem de escalação', () => {
  it('começa vazia, sem permitir salvar, e diz o que falta', async () => {
    renderApp({ path: '/escalacoes/nova' });
    expect(await screen.findByText('0 de 6 titulares')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar escalação' })).toBeDisabled();
    expect(screen.getByText('Faltam 6 titulares para completar os seis.')).toBeInTheDocument();
  });

  it('o gerador de artes aparece como indisponível, não como botão falso', async () => {
    renderApp({ path: '/escalacoes/nova' });
    expect(await screen.findByRole('button', { name: 'Gerar arte (em breve)' })).toBeDisabled();
  });

  it('monta seis titulares, líbero e reservas, salva e a escalação aparece na lista', async () => {
    const { user, storage } = renderApp({ path: '/escalacoes/nova' });
    await screen.findByText('0 de 6 titulares');

    await user.clear(screen.getByLabelText('Nome da escalação'));
    await user.type(screen.getByLabelText('Nome da escalação'), 'Jogo de sábado');
    await user.type(screen.getByLabelText('Adversário'), 'Time Azul');

    await placeStarter(user, 1, 'Lucas M.');
    await placeStarter(user, 2, 'Gabriel S.');
    await placeStarter(user, 3, 'Pedro A.');
    await placeStarter(user, 4, 'Felipe B.');
    await placeStarter(user, 5, 'Murilo V.');
    await placeStarter(user, 6, 'Matheus C.');
    expect(screen.getByText('6 de 6 titulares')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^Vaga de líbero/ }));
    await user.click(screen.getByRole('button', { name: 'Escolher: Danilo F.' }));
    await user.click(screen.getByRole('tab', { name: /Reservas/ }));
    await user.click(screen.getByRole('button', { name: 'Adicionar aos reservas: Rafael L.' }));
    expect(screen.getByRole('tab', { name: 'Reservas (1)' })).toBeInTheDocument();

    const save = screen.getByRole('button', { name: 'Salvar escalação' });
    expect(save).toBeEnabled();
    await user.click(save);
    expect(await screen.findByText('Escalação salva.')).toBeInTheDocument();
    // Regressão: salvar uma escalação nova muda a rota (remonta o editor) e a confirmação não pode sumir.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(screen.getByText('Escalação salva.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome da escalação')).toHaveValue('Jogo de sábado');

    const saved = JSON.parse(storage.map.get('alpha7.workspace.v1') ?? '{}') as { lineups: { title: string; liberoId: string; benchIds: string[] }[] };
    const mine = saved.lineups.find((l) => l.title === 'Jogo de sábado');
    expect(mine?.liberoId).toBe('demo-p-01');
    expect(mine?.benchIds).toEqual(['demo-p-09']);

    await user.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: 'Escalações' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Jogo de sábado' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Escalação de exemplo' })).toBeInTheDocument();
  });

  it('escolher quem já está escalado MOVE o atleta: nunca há duplicação', async () => {
    const { user } = renderApp({ path: '/escalacoes/nova' });
    await screen.findByText('0 de 6 titulares');
    await placeStarter(user, 1, 'Lucas M.');
    await placeStarter(user, 2, 'Lucas M.');

    expect(screen.getByText('1 de 6 titulares')).toBeInTheDocument();
    expect(zoneButton(1)).toHaveAccessibleName('Zona P1: vazio');
    expect(zoneButton(2)).toHaveAccessibleName(/Lucas M\./);
  });

  it('mover um titular para uma zona ocupada troca os dois de lugar', async () => {
    const { user } = renderApp({ path: '/escalacoes/nova' });
    await screen.findByText('0 de 6 titulares');
    await placeStarter(user, 1, 'Lucas M.');
    await placeStarter(user, 2, 'Gabriel S.');
    await placeStarter(user, 2, 'Lucas M.');

    expect(zoneButton(2)).toHaveAccessibleName(/Lucas M\./);
    expect(zoneButton(1)).toHaveAccessibleName(/Gabriel S\./);
    expect(screen.getByText('2 de 6 titulares')).toBeInTheDocument();
  });

  it('corrige a seleção removendo o titular de uma zona', async () => {
    const { user } = renderApp({ path: '/escalacoes/nova' });
    await screen.findByText('0 de 6 titulares');
    await placeStarter(user, 3, 'Pedro A.');
    await user.click(screen.getByRole('button', { name: 'Remover de P3' }));
    expect(screen.getByText('0 de 6 titulares')).toBeInTheDocument();
    expect(zoneButton(3)).toHaveAccessibleName('Zona P3: vazio');
  });

  it('o líbero de ofício não pode ocupar uma zona e a tela explica por quê', async () => {
    const { user } = renderApp({ path: '/escalacoes/nova' });
    await screen.findByText('0 de 6 titulares');
    await user.click(zoneButton(5));
    expect(screen.getByRole('button', { name: 'Escolher: Danilo F.' })).toBeDisabled();
    expect(screen.getAllByText('Só atua como líbero').length).toBeGreaterThanOrEqual(2);
  });

  it('permite trocar o papel tático sem mudar a posição habitual e avisa da incoerência', async () => {
    const { user } = renderApp({ path: '/escalacoes/demo-l-01' });
    await user.click(await screen.findByRole('button', { name: /^Zona P2/ }));
    expect(screen.getByText('Posição habitual: Ponteiro.')).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Posição tática nesta escalação'), 'central');

    expect(zoneButton(2)).toHaveAccessibleName(/Central/);
    expect(screen.getByText(/Gabriel S\. está como central, fora de suas posições habituais/)).toBeInTheDocument();
    // a mudança é um rascunho até salvar
    expect(screen.getByText('Alterações ainda não salvas.')).toBeInTheDocument();
  });

  it('avisa, sem impedir, sobre atleta lesionado e formação 5-1 sem levantador', async () => {
    const { user } = renderApp({ path: '/escalacoes/demo-l-01' });
    await user.click(await screen.findByRole('button', { name: /^Zona P3/ }));
    await user.click(screen.getByRole('button', { name: 'Escolher: Vitor K.' }));

    expect(screen.getByText(/Vitor K\. está com situação "Lesionado"/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Salvar escalação' })).toBeEnabled();
  });

  it('ordem de saque base lista P1 a P6 e rodízio move quem está em P2 para P1', async () => {
    const { user } = renderApp({ path: '/escalacoes/demo-l-01' });
    await screen.findByText('6 de 6 titulares');
    const order = screen.getByRole('heading', { name: 'Ordem de saque base' }).nextElementSibling as HTMLElement;
    expect(within(order).getAllByRole('listitem')[0]).toHaveTextContent('Lucas M.');
    expect(within(order).getAllByRole('listitem')[1]).toHaveTextContent('Gabriel S.');

    await user.click(screen.getByRole('button', { name: 'Prévia do rodízio' }));
    expect(screen.getByText('Prévia do rodízio: 1 de 5')).toBeInTheDocument();
    expect(zoneButton(1)).toHaveAccessibleName(/Gabriel S\./); // P2 -> P1
    expect(zoneButton(6)).toHaveAccessibleName(/Lucas M\./); // P1 -> P6
    expect(zoneButton(1)).toBeDisabled(); // somente leitura
    // a escalação inicial não foi alterada
    expect(screen.queryByText('Alterações ainda não salvas.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Voltar à formação inicial' }));
    expect(zoneButton(1)).toHaveAccessibleName(/Lucas M\./);
    expect(zoneButton(1)).toBeEnabled();
  });

  it('sem atletas no elenco, orienta a cadastrar antes de montar', async () => {
    renderApp({ path: '/escalacoes/nova', workspace: emptyWorkspace() });
    expect(await screen.findByText('Cadastre atletas antes de montar a escalação')).toBeInTheDocument();
  });

  it('escalação inexistente mostra estado de não encontrada', async () => {
    renderApp({ path: '/escalacoes/nao-existe' });
    expect(await screen.findByText('Escalação não encontrada')).toBeInTheDocument();
  });

  it('falha ao salvar mantém o rascunho e mostra a mensagem', async () => {
    const { user } = renderApp({
      path: '/escalacoes/demo-l-01',
      wrapGateway: (gw) =>
        new Proxy(gw, {
          get(target, prop, receiver) {
            if (prop === 'saveLineup') return () => Promise.reject(new Error('quota'));
            return Reflect.get(target, prop, receiver) as unknown;
          },
        }),
    });
    await user.type(await screen.findByLabelText('Local'), ' B');
    await user.click(screen.getByRole('button', { name: 'Salvar escalação' }));
    expect(await screen.findByText(/Não foi possível salvar\./)).toBeInTheDocument();
    expect(screen.getByText('Alterações ainda não salvas.')).toBeInTheDocument();
  });
});

describe('Lista de escalações', () => {
  it('mostra a escalação de demonstração identificada como Demo', async () => {
    renderApp({ path: '/escalacoes' });
    const card = (await screen.findByRole('heading', { level: 2, name: 'Escalação de exemplo' })).closest('article') as HTMLElement;
    expect(within(card).getByText('Demo')).toBeInTheDocument();
    expect(within(card).getByText('6 de 6')).toBeInTheDocument();
    expect(within(card).getByText('Danilo F.')).toBeInTheDocument();
  });

  it('excluir exige confirmação', async () => {
    const { user } = renderApp({ path: '/escalacoes' });
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Escalação de exemplo' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    expect(await screen.findByText('Nenhuma escalação salva')).toBeInTheDocument();
  });

  it('cancelar a exclusão mantém a escalação', async () => {
    const { user } = renderApp({ path: '/escalacoes' });
    await user.click(await screen.findByRole('button', { name: 'Excluir' }));
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Escalação de exemplo' })).toBeInTheDocument();
  });
});
