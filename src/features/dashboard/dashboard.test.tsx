import { screen, within } from '@testing-library/react';
import { createEmptyWorkspace } from '@/data/demo';
import { makeMatch, makePlayer } from '@/test/factories';
import { demoWorkspace, emptyWorkspace, renderApp } from '@/test/renderApp';

const tile = (label: string) => screen.getByText(label).closest('div') as HTMLElement;

describe('Dashboard', () => {
  it('com dados de demonstração, cada indicador diz de onde vem', async () => {
    renderApp();
    await screen.findByText('Atletas cadastrados');
    expect(within(tile('Atletas cadastrados')).getByText('18')).toBeInTheDocument();
    expect(within(tile('Atletas cadastrados')).getByText(/14 ativos · 2 lesionados · 2 em transição/)).toBeInTheDocument();
    expect(within(tile('Overall médio do elenco')).getByText(/17 de 18 atletas avaliados/)).toBeInTheDocument();
    // Treinos agora vêm dos registros (aqui, treinos de demonstração, marcados como tal)
    const trainingsTile = tile('Treinos concluídos');
    expect(within(trainingsTile).getByText('3')).toBeInTheDocument();
    expect(within(trainingsTile).getByText(/registros válidos · 1 em andamento/)).toBeInTheDocument();
    expect(within(trainingsTile).getByText('Demo')).toBeInTheDocument();
    // Partidas só existem como demonstração e são marcadas assim
    expect(within(tile('Partidas disputadas')).getByText('Demo')).toBeInTheDocument();
    expect(within(tile('Partidas disputadas')).getByText(/78,6%: 11 de 14 vitórias/)).toBeInTheDocument();
  });

  it('o Overall médio vem das avaliações reais, não é número fixo', async () => {
    renderApp();
    await screen.findByText('Overall médio do elenco');
    const value = await within(tile('Overall médio do elenco')).findByText(/^\d+$/);
    expect(Number(value.textContent)).toBeGreaterThan(60);
    expect(Number(value.textContent)).toBeLessThan(90);
  });

  it('destaques e evolução saem das avaliações e levam ao perfil', async () => {
    renderApp();
    const card = (await screen.findByRole('heading', { name: 'Destaques individuais' })).closest('section') as HTMLElement;
    // Gabriel S. lidera em Overall e também está entre os que mais evoluíram
    const gabriel = within(card).getAllByRole('link', { name: 'Gabriel S.' });
    expect(gabriel).toHaveLength(2);
    expect(gabriel[0]).toHaveAttribute('href', '/elenco/demo-p-08');
    expect(within(card).getByText('Baseados nas notas do treinador, não em estatísticas de jogo.')).toBeInTheDocument();
    const evolution = screen.getByRole('heading', { name: 'Evolução da equipe' }).closest('section') as HTMLElement;
    // o gráfico é carregado sob demanda: espera a tabela equivalente (para leitores de tela)
    // (o primeiro import() do Recharts é lento com a suíte inteira rodando em paralelo: limite folgado)
    expect(
      await within(evolution).findByRole('table', { name: 'Overall médio do elenco por mês' }, { timeout: 10_000 }),
    ).toBeInTheDocument();
  });

  it('sem nenhum dado, mostra estado vazio com a ação de cadastrar', async () => {
    renderApp({ workspace: emptyWorkspace() });
    expect(await screen.findByText('Ainda não há dados da equipe')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Adicionar jogador' })).toHaveAttribute('href', '/elenco/novo');
  });

  it('atletas sem nenhuma avaliação: Overall médio indisponível (—), nunca 0', async () => {
    const workspace = { ...createEmptyWorkspace(), players: [makePlayer({ id: 'x1', name: 'Ana Souza', jerseyNumber: 3 })] };
    renderApp({ workspace });
    await screen.findByText('Atletas cadastrados');
    const overall = tile('Overall médio do elenco');
    expect(within(overall).getByText('—')).toBeInTheDocument();
    expect(within(overall).getByText('Nenhum atleta avaliado ainda')).toBeInTheDocument();
    expect(within(overall).queryByText('0')).not.toBeInTheDocument();
    // sem treinos cadastrados: contagem real 0 com explicação; partidas indisponíveis (traço)
    const trainingsTile = tile('Treinos concluídos');
    expect(within(trainingsTile).getByText('0')).toBeInTheDocument();
    expect(within(trainingsTile).getByText('Nenhum treino cadastrado ainda')).toBeInTheDocument();
    expect(within(trainingsTile).queryByText('Demo')).not.toBeInTheDocument();
    expect(within(tile('Partidas disputadas')).getByText('—')).toBeInTheDocument();
    expect(within(tile('Partidas disputadas')).getByText('Sem partidas registradas')).toBeInTheDocument();
    expect(screen.getByText('Os destaques aparecem depois da primeira avaliação técnica.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar treino' })).toHaveAttribute('href', '/treinos/novo');
  });

  it('o banner de demonstração só aparece quando há registros de demonstração', async () => {
    const real = { ...createEmptyWorkspace(), players: [makePlayer({ id: 'x1', name: 'Ana Souza', jerseyNumber: 3 })] };
    renderApp({ workspace: real });
    await screen.findByText('Atletas cadastrados');
    expect(screen.queryByText('Dados de demonstração', { selector: 'strong' })).not.toBeInTheDocument();
  });

  it('o banner de demonstração leva ao gerenciamento dos dados', async () => {
    renderApp({ workspace: demoWorkspace() });
    expect(await screen.findByRole('link', { name: 'Gerenciar dados' })).toHaveAttribute('href', '/configuracoes#dados');
  });
});

describe('Dashboard com partidas reais', () => {
  it('usa só as partidas cadastradas (sem a marca Demo) e esconde o resumo de demonstração', async () => {
    const workspace = {
      ...demoWorkspace(),
      matches: [
        makeMatch({ id: 'a', opponent: 'Time A', status: 'concluida', finalSetsUs: 3, finalSetsThem: 1, concludedAt: '2026-10-02T10:00:00.000Z' }),
        makeMatch({ id: 'b', opponent: 'Time B', status: 'concluida', finalSetsUs: 0, finalSetsThem: 3, concludedAt: '2026-10-03T10:00:00.000Z' }),
        makeMatch({ id: 'c', opponent: 'Time C', scheduledAt: '2026-11-20T19:30', venue: 'Ginásio', competition: 'Liga' }),
      ],
    };
    renderApp({ workspace });
    await screen.findByText('Partidas disputadas');
    const played = tile('Partidas disputadas');
    expect(within(played).getByText('2')).toBeInTheDocument();
    expect(within(played).getByText(/50,0%: 1 de 2 vitórias/)).toBeInTheDocument();
    expect(within(played).queryByText('Demo')).not.toBeInTheDocument();
    expect(screen.getByText('Alpha7 vs. Time C')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver partida' })).toHaveAttribute('href', '/partidas/c');
    expect(screen.queryByText(/Alpha7 vs\. /, { selector: 'p' })).toBeInTheDocument();
  });

  it('só partidas agendadas: nenhuma disputada ainda, e a contagem não vira 0%', async () => {
    renderApp({ workspace: { ...createEmptyWorkspace(), players: [makePlayer({ id: 'x1', name: 'Ana Souza', jerseyNumber: 3 })], matches: [makeMatch({ id: 'a', opponent: 'Time A' })] } });
    await screen.findByText('Partidas disputadas');
    const played = tile('Partidas disputadas');
    expect(within(played).getByText('0')).toBeInTheDocument();
    expect(within(played).getByText('1 cadastrada, nenhuma concluída ainda')).toBeInTheDocument();
    expect(within(played).queryByText(/%/)).not.toBeInTheDocument();
  });
});

describe('Dashboard: partidas recentes e atalhos', () => {
  it('lista as partidas iniciadas com o resultado e os pontinhos de V/D; agendadas não entram na lista recente', async () => {
    const workspace = {
      ...createEmptyWorkspace(),
      players: [makePlayer({ id: 'x1', name: 'Ana Souza', jerseyNumber: 3 })],
      matches: [
        makeMatch({ id: 'a', opponent: 'Time A', status: 'concluida', finalSetsUs: 3, finalSetsThem: 1, concludedAt: '2026-10-02T10:00:00.000Z' }),
        makeMatch({ id: 'b', opponent: 'Time B', status: 'concluida', finalSetsUs: 1, finalSetsThem: 3, concludedAt: '2026-10-03T10:00:00.000Z' }),
        makeMatch({ id: 'c', opponent: 'Time C' }),
      ],
    };
    renderApp({ workspace });
    const card = (await screen.findByText('Partidas recentes')).closest('section') as HTMLElement;
    expect(within(card).getByRole('link', { name: 'Time A' })).toBeInTheDocument();
    expect(within(card).getByRole('link', { name: 'Time B' })).toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: 'Time C' })).not.toBeInTheDocument();
    expect(within(card).getByText('3 x 1')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Últimos resultados, do mais antigo ao mais recente: vitória, derrota' })).toBeInTheDocument();
  });

  it('os atalhos seguem as permissões: no modo local (sem papéis) aparecem partida, treino e arte', async () => {
    renderApp({ workspace: { ...createEmptyWorkspace(), players: [makePlayer({ id: 'x1', name: 'Ana Souza', jerseyNumber: 3 })] } });
    await screen.findByText('Atalhos rápidos');
    for (const name of ['Nova partida', 'Novo treino', 'Gerar arte da escalação']) expect(screen.getByRole('link', { name })).toBeInTheDocument();
  });
});
