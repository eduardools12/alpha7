import { screen, waitFor, within } from '@testing-library/react';
import type { LocalStorageGateway } from '@/data/localStorageGateway';
import { renderApp } from '@/test/renderApp';

const sidebar = () => within(screen.getByRole('navigation', { name: 'Principal' }));

async function fillBasics(
  user: ReturnType<typeof renderApp>['user'],
  { name, jersey, position }: { name: string; jersey: string; position: string },
) {
  await user.type(await screen.findByLabelText('Nome completo'), name);
  await user.type(screen.getByLabelText('Número da camisa'), jersey);
  if (position) await user.selectOptions(screen.getByLabelText('Posição principal'), position);
}

describe('Cadastro de jogador', () => {
  it('formulário vazio mostra os erros de cada campo, move o foco e não cadastra ninguém', async () => {
    const { user } = renderApp({ path: '/elenco/novo' });
    await user.click(await screen.findByRole('button', { name: 'Cadastrar atleta' }));

    expect(await screen.findByText('Revise os campos destacados')).toBeInTheDocument();
    expect(screen.getByText(/Informe o nome/)).toBeInTheDocument();
    expect(screen.getByText('Informe o número da camisa.')).toBeInTheDocument();
    expect(screen.getByText('Escolha a posição principal.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome completo')).toHaveAttribute('aria-invalid', 'true');
    await waitFor(() => expect(screen.getByLabelText('Nome completo')).toHaveFocus());
    expect(screen.getByRole('heading', { level: 1, name: 'Adicionar jogador' })).toBeInTheDocument();
  });

  it('o erro de um campo some quando a pessoa volta a digitar nele', async () => {
    const { user } = renderApp({ path: '/elenco/novo' });
    await user.click(await screen.findByRole('button', { name: 'Cadastrar atleta' }));
    await user.type(screen.getByLabelText('Nome completo'), 'Ana');
    expect(screen.queryByText(/Informe o nome/)).not.toBeInTheDocument();
  });

  it('rejeita número de camisa já usado e diz de quem é', async () => {
    const { user } = renderApp({ path: '/elenco/novo' });
    await fillBasics(user, { name: 'Novo Atleta', jersey: '8', position: 'central' });
    await user.click(screen.getByRole('button', { name: 'Cadastrar atleta' }));
    expect(await screen.findByText('Escolha outro número: o 8 já é de Gabriel S.')).toBeInTheDocument();
  });

  it('a posição secundária não pode repetir a principal', async () => {
    const { user } = renderApp({ path: '/elenco/novo' });
    await fillBasics(user, { name: 'Novo Atleta', jersey: '40', position: 'central' });
    const secondary = screen.getByLabelText('Posição secundária');
    expect(within(secondary).queryByRole('option', { name: 'Central' })).not.toBeInTheDocument();
  });

  it('cadastra sem avaliação: o perfil mostra Overall indisponível e o elenco passa a 19', async () => {
    const { user } = renderApp({ path: '/elenco/novo' });
    await fillBasics(user, { name: 'Rui Teixeira', jersey: '40', position: 'oposto' });
    await user.click(screen.getByRole('button', { name: 'Cadastrar atleta' }));

    expect(await screen.findByText('Atleta cadastrado.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Rui Teixeira' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Overall indisponível: sem avaliação' })).toBeInTheDocument();
    expect(screen.getByText('Este atleta ainda não foi avaliado')).toBeInTheDocument();

    await user.click(sidebar().getByRole('link', { name: 'Elenco' }));
    expect(await screen.findByText('19 jogadores')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Rui T., camisa 40, Oposto, sem avaliação' })).toBeInTheDocument();
  });

  it('cadastra com a primeira avaliação e mostra o Overall calculado', async () => {
    const { user } = renderApp({ path: '/elenco/novo' });
    await fillBasics(user, { name: 'Rui Teixeira', jersey: '40', position: 'oposto' });
    await user.click(screen.getByLabelText(/Registrar a primeira avaliação agora/));
    await user.type(screen.getByLabelText('Quem avaliou'), 'Coach Teste');
    // Todas as notas em 70 (padrão): o Overall de qualquer posição é 70
    expect(screen.getByText(/Overall calculado para oposto/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cadastrar atleta' }));

    expect(await screen.findByText('Atleta cadastrado.')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Overall 70' })).toBeInTheDocument();
    expect(screen.getByText('Coach Teste')).toBeInTheDocument();
  });

  it('nota fora da escala (150) bloqueia o cadastro com mensagem no campo', async () => {
    const { user } = renderApp({ path: '/elenco/novo' });
    await fillBasics(user, { name: 'Rui Teixeira', jersey: '40', position: 'oposto' });
    await user.click(screen.getByLabelText(/Registrar a primeira avaliação agora/));
    await user.type(screen.getByLabelText('Quem avaliou'), 'Coach Teste');
    const attack = screen.getByLabelText('Ataque ATA');
    await user.clear(attack);
    await user.type(attack, '150');
    await user.click(screen.getByRole('button', { name: 'Cadastrar atleta' }));

    expect(await screen.findByText('Ataque: use um inteiro de 1 a 99.')).toBeInTheDocument();
    expect(attack).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('heading', { level: 1, name: 'Adicionar jogador' })).toBeInTheDocument();
  });

  it('exige quem avaliou quando a avaliação inicial está marcada', async () => {
    const { user } = renderApp({ path: '/elenco/novo' });
    await fillBasics(user, { name: 'Rui Teixeira', jersey: '40', position: 'oposto' });
    await user.click(screen.getByLabelText(/Registrar a primeira avaliação agora/));
    await user.click(screen.getByRole('button', { name: 'Cadastrar atleta' }));
    expect(await screen.findByText('Informe quem fez a avaliação.')).toBeInTheDocument();
  });

  it('falha de gravação mostra a mensagem e mantém os dados digitados', async () => {
    const { user } = renderApp({
      path: '/elenco/novo',
      wrapGateway: (gw: LocalStorageGateway) =>
        new Proxy(gw, {
          get(target, prop, receiver) {
            if (prop === 'savePlayer') return () => Promise.reject(new Error('quota'));
            return Reflect.get(target, prop, receiver) as unknown;
          },
        }),
    });
    await fillBasics(user, { name: 'Rui Teixeira', jersey: '40', position: 'oposto' });
    await user.click(screen.getByRole('button', { name: 'Cadastrar atleta' }));

    expect(await screen.findByText(/Não foi possível salvar\. Verifique o espaço do navegador/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nome completo')).toHaveValue('Rui Teixeira');
    expect(screen.getByRole('button', { name: 'Cadastrar atleta' })).toBeEnabled();
  });
});

describe('Edição de jogador', () => {
  it('abre com os dados atuais e atualiza o perfil e a carta', async () => {
    const { user } = renderApp({ path: '/elenco/demo-p-08/editar' });
    expect(await screen.findByLabelText('Nome completo')).toHaveValue('Gabriel Silva');
    expect(screen.getByLabelText('Número da camisa')).toHaveValue('8');

    const name = screen.getByLabelText('Nome completo');
    await user.clear(name);
    await user.type(name, 'Gabriel Souza');
    await user.selectOptions(screen.getByLabelText('Situação'), 'lesionado');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByText('Perfil atualizado.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Gabriel Souza' })).toBeInTheDocument();
    expect(screen.getByText('Lesionado')).toBeInTheDocument();

    await user.click(sidebar().getByRole('link', { name: 'Elenco' }));
    expect(await screen.findByRole('link', { name: 'Gabriel S., camisa 8, Ponteiro, Overall 85' })).toBeInTheDocument();
  });

  it('o atleta pode manter o próprio número, mas não tomar o de outro', async () => {
    const { user } = renderApp({ path: '/elenco/demo-p-08/editar' });
    const number = await screen.findByLabelText('Número da camisa');
    await user.clear(number);
    await user.type(number, '4');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    expect(await screen.findByText('Escolha outro número: o 4 já é de Lucas M.')).toBeInTheDocument();
  });

  it('editar o cadastro não altera as avaliações (dados cadastrais são independentes)', async () => {
    const { user } = renderApp({ path: '/elenco/demo-p-08/editar' });
    await user.selectOptions(await screen.findByLabelText('Posição secundária'), '');
    await user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByText('Perfil atualizado.');
    expect(screen.getByRole('meter', { name: 'Ataque' })).toHaveAttribute('aria-valuenow', '91');
    expect(screen.getByRole('img', { name: 'Overall 85' })).toBeInTheDocument();
  });

  it('atleta inexistente mostra estado de não encontrado', async () => {
    renderApp({ path: '/elenco/nao-existe/editar' });
    expect(await screen.findByText('Atleta não encontrado')).toBeInTheDocument();
  });
});
