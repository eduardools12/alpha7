import { screen, waitFor, within } from '@testing-library/react';
import { createEmptyWorkspace } from '@/data/demo';
import { STORAGE_KEY } from '@/data/localStorageGateway';
import type { Training, TrainingEvent, TrainingExercise } from '@/domain/training';
import { demoWorkspace, emptyWorkspace, renderApp } from '@/test/renderApp';
import { todayIso } from '@/domain/id';

type Ctx = ReturnType<typeof renderApp>;

interface Saved {
  trainings: Training[];
  exercises: TrainingExercise[];
  trainingEvents: TrainingEvent[];
}
const saved = (ctx: Pick<Ctx, 'storage'>) => JSON.parse(ctx.storage.map.get(STORAGE_KEY) ?? '{}') as Saved;
const sidebar = () => within(screen.getByRole('navigation', { name: 'Principal' }));

describe('Lista de treinos', () => {
  it('mostra os treinos do mais recente ao mais antigo, com status, etiqueta Demo e contagens', async () => {
    renderApp({ path: '/treinos' });
    const titles = await screen.findAllByRole('heading', { level: 2 });
    expect(titles.map((h) => h.textContent)).toEqual(['Treino de hoje', 'Transição e saque', 'Recepção e levantamento', 'Ataque e bloqueio']);
    expect(screen.getAllByText('Em andamento')).toHaveLength(1);
    expect(screen.getAllByText('Concluído')).toHaveLength(3);
    expect(screen.getAllByText('Demo')).toHaveLength(4);

    const open = (titles[0] as HTMLElement).closest('article') as HTMLElement;
    const facts = within(open);
    expect(facts.getByText('Participantes').nextElementSibling).toHaveTextContent('12');
    expect(facts.getByText('Exercícios').nextElementSibling).toHaveTextContent('2');
    expect(facts.getByText('Registros').nextElementSibling).toHaveTextContent('0');
  });

  it('só treinos em andamento oferecem "Registrar"; todos oferecem resumo e edição', async () => {
    renderApp({ path: '/treinos' });
    await screen.findByText('Treino de hoje');
    expect(screen.getAllByRole('link', { name: 'Registrar' })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: 'Resumo' })).toHaveLength(4);
    expect(screen.getByRole('link', { name: 'Editar Transição e saque' })).toHaveAttribute('href', '/treinos/demo-t-01/editar');
  });

  it('avisa que os dados ficam só neste navegador', async () => {
    renderApp({ path: '/treinos' });
    expect(await screen.findByText(/ficam salvos só neste navegador \(armazenamento local\), sem sincronização com a nuvem/)).toBeInTheDocument();
  });

  it('sem treinos, mostra estado vazio com a ação de criar', async () => {
    renderApp({ path: '/treinos', workspace: emptyWorkspace() });
    expect(await screen.findByText('Nenhum treino cadastrado')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Criar o primeiro treino' })).toHaveAttribute('href', '/treinos/novo');
  });

  it('excluir pede confirmação, informa o que será apagado e remove em cascata só aquele treino', async () => {
    const demo = demoWorkspace();
    const ofT01 = demo.trainingEvents.filter((e) => e.trainingId === 'demo-t-01').length;
    const ctx = renderApp({ path: '/treinos' });
    await ctx.user.click(await screen.findByRole('button', { name: 'Excluir Transição e saque' }));

    expect(screen.getByText(`Serão apagados 3 exercícios e ${ofT01} registros deste treino. Isso não pode ser desfeito.`)).toBeInTheDocument();
    const outros = JSON.stringify(saved(ctx).trainingEvents.filter((e) => e.trainingId !== 'demo-t-01'));
    await ctx.user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));

    await waitFor(() => expect(screen.queryByText('Transição e saque')).not.toBeInTheDocument());
    const after = saved(ctx);
    expect(after.trainings.map((t) => t.id)).toEqual(['demo-t-02', 'demo-t-03', 'demo-t-04']);
    expect(after.exercises.some((e) => e.trainingId === 'demo-t-01')).toBe(false);
    expect(after.trainingEvents.some((e) => e.trainingId === 'demo-t-01')).toBe(false);
    expect(JSON.stringify(after.trainingEvents)).toBe(outros); // os demais treinos ficaram intactos
  });

  it('cancelar a exclusão mantém o treino e os registros', async () => {
    const ctx = renderApp({ path: '/treinos' });
    const before = saved(ctx).trainingEvents.length;
    await ctx.user.click(await screen.findByRole('button', { name: 'Excluir Transição e saque' }));
    await ctx.user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.getByText('Transição e saque')).toBeInTheDocument();
    expect(saved(ctx).trainingEvents).toHaveLength(before);
  });

  it('a exclusão persiste: após recarregar, o treino continua excluído', async () => {
    const first = renderApp({ path: '/treinos' });
    await first.user.click(await screen.findByRole('button', { name: 'Excluir Ataque e bloqueio' }));
    await first.user.click(screen.getByRole('button', { name: 'Confirmar exclusão' }));
    await waitFor(() => expect(screen.queryByText('Ataque e bloqueio')).not.toBeInTheDocument());
    first.unmount();
    renderApp({ path: '/treinos', storage: first.storage });
    await screen.findByText('Treino de hoje');
    expect(screen.queryByText('Ataque e bloqueio')).not.toBeInTheDocument();
  });

  it('o menu "Treinos" fica ativo nas subtelas', async () => {
    renderApp({ path: '/treinos/demo-t-01' });
    await screen.findByRole('heading', { level: 1, name: 'Transição e saque' });
    expect(sidebar().getByRole('link', { name: 'Treinos' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Criar treino', () => {
  async function openNew() {
    const ctx = renderApp({ path: '/treinos/novo' });
    await screen.findByRole('heading', { level: 1, name: 'Novo treino' });
    return ctx;
  }

  it('começa com a data de hoje e os atletas ativos pré-selecionados', async () => {
    await openNew();
    expect(screen.getByLabelText('Data')).toHaveValue(todayIso());
    expect(screen.getByText(/de 18 selecionados/)).toHaveTextContent('14 de 18 selecionados');
  });

  it('nome vazio mostra o erro, leva o foco ao campo e não cria nada', async () => {
    const ctx = await openNew();
    await ctx.user.click(screen.getByRole('button', { name: 'Criar treino' }));
    expect(await screen.findByText('Revise os campos destacados')).toBeInTheDocument();
    expect(screen.getByText(/Informe o nome do treino/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByLabelText('Nome do treino')).toHaveFocus());
    expect(saved(ctx).trainings).toHaveLength(4);
  });

  it('duração inválida e exercícios repetidos ou sem nome são recusados', async () => {
    const ctx = await openNew();
    await ctx.user.type(screen.getByLabelText('Nome do treino'), 'Treino de teste');
    await ctx.user.type(screen.getByLabelText('Duração em minutos (opcional)'), '999');
    await ctx.user.click(screen.getByRole('button', { name: 'Adicionar exercício' }));
    await ctx.user.click(screen.getByRole('button', { name: 'Adicionar exercício' }));
    await ctx.user.click(screen.getByRole('button', { name: 'Adicionar exercício' }));
    await ctx.user.type(screen.getByLabelText('Exercício 1'), 'Saque em zonas');
    await ctx.user.type(screen.getByLabelText('Exercício 2'), 'saque EM zonas');
    await ctx.user.click(screen.getByRole('button', { name: 'Criar treino' }));

    expect(await screen.findByText(/Use minutos inteiros de 1 a 600/)).toBeInTheDocument();
    expect(screen.getByText('Já existe um exercício chamado "saque EM zonas" neste treino.')).toBeInTheDocument();
    expect(screen.getByText(/Dê um nome ao exercício/)).toBeInTheDocument();
    expect(saved(ctx).trainings).toHaveLength(4);
  });

  it('seleção de participantes: limpar, incluir todos os ativos e marcar um a um', async () => {
    const ctx = await openNew();
    await ctx.user.click(screen.getByRole('button', { name: 'Limpar seleção' }));
    expect(screen.getByText(/de 18 selecionados/)).toHaveTextContent('0 de 18 selecionados');
    await ctx.user.click(screen.getByRole('checkbox', { name: /Gabriel S\. #8/ }));
    expect(screen.getByText(/de 18 selecionados/)).toHaveTextContent('1 de 18 selecionados');
    await ctx.user.click(screen.getByRole('button', { name: 'Incluir todos os ativos' }));
    expect(screen.getByText(/de 18 selecionados/)).toHaveTextContent('14 de 18 selecionados');
  });

  it('cria o treino com identificação própria, participantes e exercícios ligados a ele, e abre o resumo', async () => {
    const ctx = await openNew();
    await ctx.user.type(screen.getByLabelText('Nome do treino'), '  Saque e recepção  ');
    await ctx.user.type(screen.getByLabelText('Duração em minutos (opcional)'), '75');
    await ctx.user.type(screen.getByLabelText('Responsável pelo registro (opcional)'), 'Coach Teste');
    await ctx.user.type(screen.getByLabelText('Descrição (opcional)'), 'Foco em saque float');
    await ctx.user.click(screen.getByRole('button', { name: 'Limpar seleção' }));
    await ctx.user.click(screen.getByRole('checkbox', { name: /Gabriel S\. #8/ }));
    await ctx.user.click(screen.getByRole('checkbox', { name: /Lucas M\. #4/ }));
    await ctx.user.click(screen.getByRole('button', { name: 'Adicionar exercício' }));
    await ctx.user.type(screen.getByLabelText('Exercício 1'), 'Saque em zonas');
    await ctx.user.selectOptions(screen.getByLabelText('Fundamento em foco do exercício 1'), 'saque');
    await ctx.user.click(screen.getByRole('button', { name: 'Adicionar exercício' }));
    await ctx.user.type(screen.getByLabelText('Exercício 2'), 'Jogo reduzido');
    await ctx.user.click(screen.getByRole('button', { name: 'Criar treino' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Saque e recepção' })).toBeInTheDocument();
    expect(screen.getByText('Treino criado.')).toBeInTheDocument();
    expect(screen.getByText('1 h 15 min', { exact: false })).toBeInTheDocument();

    const data = saved(ctx);
    const created = data.trainings.find((t) => t.name === 'Saque e recepção')!;
    expect(created).toMatchObject({
      status: 'aberto',
      durationMinutes: 75,
      responsible: 'Coach Teste',
      description: 'Foco em saque float',
      demo: false,
    });
    expect(created.participantIds.slice().sort()).toEqual(['demo-p-04', 'demo-p-08']);
    expect(new Set(data.trainings.map((t) => t.id)).size).toBe(5); // identificação própria
    const exs = data.exercises.filter((e) => e.trainingId === created.id).sort((a, b) => a.order - b.order);
    expect(exs.map((e) => [e.name, e.focus, e.order])).toEqual([
      ['Saque em zonas', 'saque', 0],
      ['Jogo reduzido', null, 1],
    ]);
    expect(data.trainingEvents.filter((e) => e.trainingId === created.id)).toHaveLength(0);
  });

  it('o treino criado aparece na lista e pode receber registros logo em seguida', async () => {
    const ctx = await openNew();
    await ctx.user.type(screen.getByLabelText('Nome do treino'), 'Treino novo');
    await ctx.user.click(screen.getByRole('button', { name: 'Adicionar exercício' }));
    await ctx.user.type(screen.getByLabelText('Exercício 1'), 'Saque');
    await ctx.user.click(screen.getByRole('button', { name: 'Criar treino' }));
    await screen.findByText('Treino criado.');

    await ctx.user.click(screen.getByRole('link', { name: 'Registrar' }));
    await screen.findByRole('heading', { level: 1, name: 'Registrar treino' });
    expect(screen.getByRole('button', { name: /Gabriel S\./ })).toBeInTheDocument();
  });

  it('falha de gravação mostra a mensagem e mantém o que foi digitado', async () => {
    const ctx = renderApp({
      path: '/treinos/novo',
      wrapGateway: (gw) =>
        new Proxy(gw, {
          get(target, prop, receiver) {
            if (prop === 'saveTraining') return () => Promise.reject(new Error('quota'));
            return Reflect.get(target, prop, receiver) as unknown;
          },
        }),
    });
    await ctx.user.type(await screen.findByLabelText('Nome do treino'), 'Treino que falha');
    await ctx.user.click(screen.getByRole('button', { name: 'Criar treino' }));
    expect(await screen.findByText(/Não foi possível salvar\. Verifique o espaço do navegador/)).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do treino')).toHaveValue('Treino que falha');
    expect(screen.getByRole('button', { name: 'Criar treino' })).toBeEnabled();
  });

  it('com elenco vazio, orienta a cadastrar atletas', async () => {
    renderApp({ path: '/treinos/novo', workspace: createEmptyWorkspace() });
    expect(await screen.findByText(/O elenco está vazio/)).toBeInTheDocument();
  });
});

describe('Editar treino', () => {
  async function openEdit(id = 'demo-t-01') {
    const ctx = renderApp({ path: `/treinos/${id}/editar` });
    await screen.findByRole('heading', { level: 1, name: 'Editar treino' });
    return ctx;
  }

  it('abre com os dados atuais', async () => {
    await openEdit();
    expect(screen.getByLabelText('Nome do treino')).toHaveValue('Transição e saque');
    expect(screen.getByLabelText('Duração em minutos (opcional)')).toHaveValue('100');
    expect(screen.getByLabelText('Exercício 1')).toHaveValue('Saque em zonas');
    expect(screen.getByLabelText('Exercício 3')).toHaveValue('Transição defesa e ataque');
    expect(screen.getByText(/de 18 selecionados/)).toHaveTextContent('14 de 18 selecionados');
  });

  it('editar nome, descrição e observações PRESERVA todos os registros e exercícios', async () => {
    const ctx = await openEdit();
    const before = saved(ctx);
    const name = screen.getByLabelText('Nome do treino');
    await ctx.user.clear(name);
    await ctx.user.type(name, 'Transição, saque e defesa');
    const description = screen.getByLabelText('Descrição (opcional)');
    await ctx.user.clear(description);
    await ctx.user.type(description, 'Descrição nova');
    await ctx.user.type(screen.getByLabelText('Observações (opcional)'), ' Mais uma observação.');
    await ctx.user.click(screen.getByRole('button', { name: 'Salvar alterações' }));

    expect(await screen.findByText('Treino atualizado. Os registros foram mantidos.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Transição, saque e defesa' })).toBeInTheDocument();
    const after = saved(ctx);
    expect(JSON.stringify(after.trainingEvents)).toBe(JSON.stringify(before.trainingEvents)); // nenhum registro tocado
    expect(after.exercises.filter((e) => e.trainingId === 'demo-t-01').map((e) => e.id)).toEqual(
      before.exercises.filter((e) => e.trainingId === 'demo-t-01').map((e) => e.id),
    );
    const edited = after.trainings.find((t) => t.id === 'demo-t-01')!;
    expect(edited).toMatchObject({ name: 'Transição, saque e defesa', description: 'Descrição nova', status: 'concluido' });
    expect(edited.notes).toMatch(/Mais uma observação\./);
    expect(edited.createdAt).toBe(before.trainings.find((t) => t.id === 'demo-t-01')!.createdAt);
  });

  it('renomear um exercício que já tem registros mantém os registros ligados a ele', async () => {
    const ctx = await openEdit();
    const before = saved(ctx).trainingEvents.filter((e) => e.exerciseId === 'demo-x-01-1').length;
    expect(before).toBeGreaterThan(0);
    const ex = screen.getByLabelText('Exercício 1');
    await ctx.user.clear(ex);
    await ctx.user.type(ex, 'Saque float em zonas');
    await ctx.user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByText('Treino atualizado. Os registros foram mantidos.');
    const after = saved(ctx);
    expect(after.exercises.find((e) => e.id === 'demo-x-01-1')!.name).toBe('Saque float em zonas');
    expect(after.trainingEvents.filter((e) => e.exerciseId === 'demo-x-01-1')).toHaveLength(before);
  });

  it('exercício com registros não pode ser removido (botão desativado, com o motivo)', async () => {
    await openEdit();
    const button = screen.getByRole('button', { name: /Remover exercício 1 \(tem \d+ registros\)/ });
    expect(button).toBeDisabled();
  });

  it('participante com registros válidos não pode sair da lista', async () => {
    await openEdit();
    const box = screen.getByRole('checkbox', { name: /Gabriel S\. #8/ });
    expect(box).toBeChecked();
    expect(box).toBeDisabled();
    expect(screen.getAllByText(/não pode sair/).length).toBeGreaterThan(0);
  });

  it('é possível adicionar um exercício novo em treino já existente, sem mexer nos antigos', async () => {
    const ctx = await openEdit();
    await ctx.user.click(screen.getByRole('button', { name: 'Adicionar exercício' }));
    await ctx.user.type(screen.getByLabelText('Exercício 4'), 'Alongamento final');
    await ctx.user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByText('Treino atualizado. Os registros foram mantidos.');
    const exs = saved(ctx).exercises.filter((e) => e.trainingId === 'demo-t-01').sort((a, b) => a.order - b.order);
    expect(exs.map((e) => e.name)).toEqual(['Saque em zonas', 'Recepção e ataque de ponteiro', 'Transição defesa e ataque', 'Alongamento final']);
  });

  it('em treino sem registros, exercícios e participantes podem ser removidos', async () => {
    const ctx = await openEdit('demo-t-04');
    await ctx.user.click(screen.getByRole('button', { name: 'Remover exercício 1' }));
    await ctx.user.click(screen.getByRole('checkbox', { name: /Gabriel S\. #8/ }));
    await ctx.user.click(screen.getByRole('button', { name: 'Salvar alterações' }));
    await screen.findByText('Treino atualizado. Os registros foram mantidos.');
    const t = saved(ctx).trainings.find((x) => x.id === 'demo-t-04')!;
    expect(t.participantIds).not.toContain('demo-p-08');
    expect(saved(ctx).exercises.filter((e) => e.trainingId === 'demo-t-04').map((e) => e.name)).toEqual(['Saque e recepção']);
  });

  it('treino inexistente mostra estado de não encontrado', async () => {
    renderApp({ path: '/treinos/nao-existe/editar' });
    expect(await screen.findByText('Treino não encontrado')).toBeInTheDocument();
  });
});
