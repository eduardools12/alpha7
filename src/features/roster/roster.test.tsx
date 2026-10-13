import { screen, within } from '@testing-library/react';
import { emptyWorkspace, renderApp } from '@/test/renderApp';

const cards = () => screen.getAllByRole('link', { name: /camisa \d+/ });

describe('Elenco: listagem, busca e filtros', () => {
  it('lista os 18 atletas de demonstração como cartas', async () => {
    renderApp({ path: '/elenco' });
    expect(await screen.findByText('18 jogadores')).toBeInTheDocument();
    expect(cards()).toHaveLength(18);
  });

  it('cada carta informa nome, camisa, posição e Overall no nome acessível', async () => {
    renderApp({ path: '/elenco' });
    expect(await screen.findByRole('link', { name: 'Gabriel S., camisa 8, Ponteiro, Overall 85' })).toHaveAttribute(
      'href',
      '/elenco/demo-p-08',
    );
  });

  it('busca por nome, sem diferenciar maiúsculas', async () => {
    const { user } = renderApp({ path: '/elenco' });
    await user.type(await screen.findByLabelText('Buscar por nome ou número'), 'GABR');
    expect(cards()).toHaveLength(1);
    expect(screen.getByText('1 de 18 jogadores')).toBeInTheDocument();
  });

  it('busca por número da camisa, com "#"', async () => {
    const { user } = renderApp({ path: '/elenco' });
    await user.type(await screen.findByLabelText('Buscar por nome ou número'), '#11');
    expect(cards()).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Vitor K\./ })).toBeInTheDocument();
  });

  it('filtra por posição e marca o filtro ativo com aria-pressed', async () => {
    const { user } = renderApp({ path: '/elenco' });
    const group = within(await screen.findByRole('group', { name: 'Posição' }));
    await user.click(group.getByRole('button', { name: 'Central' }));
    expect(group.getByRole('button', { name: 'Central' })).toHaveAttribute('aria-pressed', 'true');
    expect(group.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'false');
    expect(cards()).toHaveLength(4);
    expect(screen.getByText('4 de 18 jogadores')).toBeInTheDocument();
  });

  it('filtra por situação: desmarcar "Ativo" deixa só lesionados e em transição', async () => {
    const { user } = renderApp({ path: '/elenco' });
    const group = within(await screen.findByRole('group', { name: 'Situação' }));
    await user.click(group.getByRole('button', { name: 'Ativo' }));
    expect(cards()).toHaveLength(4); // 2 lesionados + 2 em transição
    expect(screen.queryByRole('link', { name: /Gabriel S\./ })).not.toBeInTheDocument();
  });

  it('combina busca e filtro; sem resultado mostra estado vazio e permite limpar', async () => {
    const { user } = renderApp({ path: '/elenco' });
    const group = within(await screen.findByRole('group', { name: 'Posição' }));
    await user.click(group.getByRole('button', { name: 'Líbero' }));
    await user.type(screen.getByLabelText('Buscar por nome ou número'), 'gabriel');
    expect(screen.getByText('Nenhum atleta encontrado')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(await screen.findByText('18 jogadores')).toBeInTheDocument();
    expect(screen.getByLabelText('Buscar por nome ou número')).toHaveValue('');
  });

  it('os filtros ficam na URL e sobrevivem a um recarregamento', async () => {
    renderApp({ path: '/elenco?q=lucas&posicao=levantador' });
    expect(await screen.findByLabelText('Buscar por nome ou número')).toHaveValue('lucas');
    expect(cards()).toHaveLength(1);
    expect(within(screen.getByRole('group', { name: 'Posição' })).getByRole('button', { name: 'Levantador' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('ignora valores inválidos de posição na URL', async () => {
    renderApp({ path: '/elenco?posicao=goleiro' });
    expect(await screen.findByText('18 jogadores')).toBeInTheDocument();
  });
});

describe('Elenco: dados ausentes', () => {
  it('atleta sem avaliação mostra "Sem avaliação" e traços, nunca zero', async () => {
    renderApp({ path: '/elenco' });
    const card = await screen.findByRole('link', { name: 'Otávio H., camisa 18, Ponteiro, sem avaliação' });
    expect(within(card).getByText('Sem avaliação')).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: 'Overall indisponível: sem avaliação' })).toBeInTheDocument();
    expect(within(card).queryByText('0')).not.toBeInTheDocument();
    expect(within(card).getAllByText('—').length).toBeGreaterThanOrEqual(6);
  });

  it('elenco vazio convida a cadastrar o primeiro atleta', async () => {
    renderApp({ path: '/elenco', workspace: emptyWorkspace() });
    expect(await screen.findByText('O elenco está vazio')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cadastrar o primeiro atleta' })).toHaveAttribute('href', '/elenco/novo');
    expect(screen.queryByLabelText('Buscar por nome ou número')).not.toBeInTheDocument();
  });
});
