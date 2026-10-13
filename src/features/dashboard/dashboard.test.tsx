import { screen, within } from '@testing-library/react';
import { createEmptyWorkspace } from '@/data/demo';
import { makePlayer } from '@/test/factories';
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
