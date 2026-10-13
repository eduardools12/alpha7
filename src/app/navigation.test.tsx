import { screen, within } from '@testing-library/react';
import { renderApp } from '@/test/renderApp';

describe('navegação principal', () => {
  it('abre no dashboard e identifica os dados de demonstração', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 1, name: 'Alpha7 Performance' })).toBeInTheDocument();
    expect(screen.getByText('Dados de demonstração', { selector: 'strong' })).toBeInTheDocument();
    expect(screen.getByText('Atletas cadastrados')).toBeInTheDocument();
  });

  it('o menu lateral leva a cada módulo previsto', async () => {
    const { user } = renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Alpha7 Performance' });
    const nav = screen.getByRole('navigation', { name: 'Principal' });

    const destinations: [string, string][] = [
      ['Elenco', 'Elenco'],
      ['Escalações', 'Escalações'],
      ['Treinos', 'Treinos'],
      ['Partidas', 'Partidas'],
      ['Estatísticas', 'Estatísticas'],
      ['Configurações', 'Configurações'],
      ['Dashboard', 'Alpha7 Performance'],
    ];
    for (const [link, heading] of destinations) {
      await user.click(within(nav).getByRole('link', { name: link }));
      expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
    }
  });

  it('marca o item atual com aria-current', async () => {
    const { user } = renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Alpha7 Performance' });
    const nav = screen.getByRole('navigation', { name: 'Principal' });
    await user.click(within(nav).getByRole('link', { name: 'Elenco' }));
    expect(within(nav).getByRole('link', { name: 'Elenco' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('o título da aba acompanha a tela', async () => {
    const { user } = renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Alpha7 Performance' });
    await user.click(within(screen.getByRole('navigation', { name: 'Principal' })).getByRole('link', { name: 'Escalações' }));
    await screen.findByRole('heading', { level: 1, name: 'Escalações' });
    expect(document.title).toBe('Escalações · Alpha7 Volleyball Performance');
  });

  it('endereço inexistente mostra a página de não encontrado com caminho de volta', async () => {
    renderApp({ path: '/nao-existe' });
    expect(await screen.findByRole('heading', { level: 1, name: 'Página não encontrada' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir ao dashboard' })).toHaveAttribute('href', '/');
  });
});

describe('navegação no celular', () => {
  async function openMobile() {
    const utils = renderApp();
    await screen.findByRole('heading', { level: 1, name: 'Alpha7 Performance' });
    return { ...utils, bar: screen.getByRole('navigation', { name: 'Principal, celular' }) };
  }

  it('a barra inferior tem quatro destinos e o botão Mais', async () => {
    const { bar } = await openMobile();
    for (const name of ['Dashboard', 'Elenco', 'Escalações', 'Treinos']) {
      expect(within(bar).getByRole('link', { name })).toBeInTheDocument();
    }
    expect(within(bar).getByRole('button', { name: 'Mais' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('"Mais" abre os demais módulos, fecha com Escape e devolve o foco ao botão', async () => {
    const { user, bar } = await openMobile();
    const more = within(bar).getByRole('button', { name: 'Mais' });
    await user.click(more);
    expect(more).toHaveAttribute('aria-expanded', 'true');
    const menu = document.getElementById('menu-mais') as HTMLElement;
    for (const name of ['Partidas', 'Estatísticas', 'Configurações']) {
      expect(within(menu).getByRole('link', { name })).toBeInTheDocument();
    }
    await user.keyboard('{Escape}');
    expect(more).toHaveAttribute('aria-expanded', 'false');
    expect(more).toHaveFocus();
  });

  it('escolher um módulo no menu "Mais" navega e fecha o menu', async () => {
    const { user, bar } = await openMobile();
    await user.click(within(bar).getByRole('button', { name: 'Mais' }));
    await user.click(within(document.getElementById('menu-mais') as HTMLElement).getByRole('link', { name: 'Estatísticas' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Estatísticas' })).toBeInTheDocument();
    expect(document.getElementById('menu-mais')).toBeNull();
  });
});

describe('módulos ainda não desenvolvidos', () => {
  it.each([
    ['/partidas', 'Partidas'],
    ['/estatisticas', 'Estatísticas'],
  ])('%s declara que está em desenvolvimento e não oferece controles falsos', async (path, title) => {
    renderApp({ path });
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument();
    expect(screen.getByText('Este módulo ainda está em desenvolvimento')).toBeInTheDocument();
    const main = screen.getByRole('main');
    expect(within(main).queryAllByRole('button')).toHaveLength(0);
    expect(within(main).queryAllByRole('textbox')).toHaveLength(0);
  });
});
