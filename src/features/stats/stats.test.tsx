import { screen, waitFor, within } from '@testing-library/react';
import { createEmptyWorkspace } from '@/data/demo';
import type { Workspace } from '@/data/types';
import { makeEvent, makeMatch, makePlayer, makeRally, makeRallyAction, makeTraining } from '@/test/factories';
import { renderApp } from '@/test/renderApp';

const pa = makePlayer({ id: 'pa', name: 'Ana Alves', jerseyNumber: 1, primaryPosition: 'ponteiro' });
const pb = makePlayer({ id: 'pb', name: 'Bia Borges', jerseyNumber: 2, primaryPosition: 'ponteiro' });

function world(): Workspace {
  const m1 = makeMatch({ id: 'm1', opponent: 'Rivais', scheduledAt: '2026-10-05T19:00', status: 'concluida', finalSetsUs: 1, finalSetsThem: 0, concludedAt: '2026-10-05T22:00:00.000Z' });
  const rallies = [
    makeRally('m1', 1, 1, { id: 'r1', servingSide: 'us', winnerSide: 'us', rotation: 0 }),
    makeRally('m1', 1, 2, { servingSide: 'us', winnerSide: 'them', rotation: 0 }),
    makeRally('m1', 1, 3, { servingSide: 'them', winnerSide: 'us', rotation: 0 }),
    makeRally('m1', 1, 4, { servingSide: 'them', winnerSide: 'them', rotation: 0 }),
  ];
  const t1 = makeTraining({ id: 't1', name: 'Treino 1', date: '2026-10-01', participantIds: ['pa', 'pb'] });
  return {
    ...createEmptyWorkspace(),
    players: [pa, pb],
    trainings: [t1],
    trainingEvents: [makeEvent('t1', 'x', 'pa', 'saque', 'ace'), makeEvent('t1', 'x', 'pa', 'saque', 'erro')],
    matches: [m1],
    rallies,
    rallyActions: [makeRallyAction('m1', 'r1', 'pa', 'saque', 'ace')],
  };
}

describe('Estatísticas', () => {
  it('sem registros, convida a registrar e não mostra nenhum indicador', async () => {
    renderApp({ path: '/estatisticas', workspace: createEmptyWorkspace() });
    expect(await screen.findByText('Ainda não há registros para analisar')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
  });

  it('mostra side-out e ponto de saque com acertos e tentativas, e sinaliza amostra pequena', async () => {
    renderApp({ path: '/estatisticas', workspace: world() });
    expect(await screen.findByRole('heading', { name: 'Partidas: como os pontos saem' })).toBeInTheDocument();
    const sideOut = screen.getByText('Side-out').closest('div') as HTMLElement;
    expect(within(sideOut).getByText('50,0%')).toBeInTheDocument();
    expect(within(sideOut).getByText('1 de 2')).toBeInTheDocument();
    expect(within(sideOut).getByText(/Amostra pequena: 2 tentativas/)).toBeInTheDocument();
  });

  it('treinos e partidas aparecem separados por fundamento; sem registros de um lado, "Sem dados"', async () => {
    renderApp({ path: '/estatisticas', workspace: world() });
    const card = (await screen.findByRole('heading', { name: 'Saque', level: 2 })).closest('section') as HTMLElement;
    expect(within(card).getByText('Treinos')).toBeInTheDocument();
    expect(within(card).getByText('Partidas')).toBeInTheDocument();
    const blocking = (await screen.findByRole('heading', { name: 'Bloqueio', level: 2 })).closest('section') as HTMLElement;
    expect(within(blocking).getByText('Sem dados de treinos neste recorte.')).toBeInTheDocument();
    expect(within(blocking).getByText('Sem dados de partidas neste recorte.')).toBeInTheDocument();
  });

  it('o filtro de período sem registros mostra o estado vazio e limpar volta tudo', async () => {
    const { user } = renderApp({ path: '/estatisticas', workspace: world() });
    await screen.findByText(/Considerando 1 treino/);
    await user.type(screen.getByLabelText('De (início do período)'), '2027-01-01');
    expect(await screen.findByText('Nenhum registro com esses filtros')).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: 'Limpar filtros' })[0] as HTMLElement);
    await waitFor(() => expect(screen.getByText(/Considerando 1 treino/)).toBeInTheDocument());
  });

  it('visão individual: atleta escolhido mostra resultado por partida e a nota de que não mexe no Overall', async () => {
    const { user } = renderApp({ path: '/estatisticas', workspace: world() });
    await user.selectOptions(await screen.findByLabelText('Atleta'), 'pa');
    expect(await screen.findByRole('heading', { name: /Visão individual: Ana A\. #1/ })).toBeInTheDocument();
    expect(screen.getByText(/nada aqui altera a avaliação nem o Overall/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: /Participação do atleta em cada partida/ })).toBeInTheDocument();
  });
});
