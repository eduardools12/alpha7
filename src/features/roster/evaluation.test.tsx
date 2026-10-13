import { screen, within } from '@testing-library/react';
import { todayIso } from '@/domain/id';
import { renderApp } from '@/test/renderApp';

const history = () => within(screen.getByRole('heading', { name: 'Histórico de avaliações' }).closest('section') as HTMLElement);

describe('Perfil do atleta', () => {
  it('mostra identidade, Overall, atributos nos dois grupos e histórico', async () => {
    renderApp({ path: '/elenco/demo-p-08' });
    expect(await screen.findByRole('heading', { level: 2, name: 'Gabriel Silva' })).toBeInTheDocument();
    expect(screen.getByText(/Nº 8 · Ponteiro \(principal\) \/ Oposto \(secundária\)/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Overall 85' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Saque' })).toHaveAttribute('aria-valuenow', '85');
    expect(screen.getByRole('meter', { name: 'Impulsão' })).toHaveAttribute('aria-valuenow', '94');
    expect(screen.getAllByRole('meter')).toHaveLength(9);
    expect(history().getAllByRole('listitem')).toHaveLength(6);
  });

  it('o Overall é explicável: a tabela soma exatamente a nota arredondada', async () => {
    renderApp({ path: '/elenco/demo-p-08' });
    await screen.findByRole('heading', { level: 2, name: 'Gabriel Silva' });
    expect(screen.getByText('Como o Overall foi calculado')).toBeInTheDocument();
    expect(screen.getByText(/85\.1\s*→/)).toBeInTheDocument();
  });

  it('estatísticas observadas ficam indisponíveis, não zero, quando não há registros', async () => {
    renderApp({ path: '/elenco/demo-p-08' });
    await screen.findByRole('heading', { level: 2, name: 'Gabriel Silva' });
    const card = screen.getByRole('heading', { name: 'Métricas reais de partidas e treinos' }).closest('section') as HTMLElement;
    expect(within(card).getAllByLabelText('indisponível')).toHaveLength(5);
    expect(within(card).queryByText('0')).not.toBeInTheDocument();
    expect(within(card).queryByText('0%')).not.toBeInTheDocument();
  });

  it('atleta sem avaliação: Overall indisponível, sem gráfico e com convite para avaliar', async () => {
    renderApp({ path: '/elenco/demo-p-18' });
    expect(await screen.findByRole('img', { name: 'Overall indisponível: sem avaliação' })).toBeInTheDocument();
    expect(screen.getByText('Este atleta ainda não foi avaliado')).toBeInTheDocument();
    expect(screen.getByText('O gráfico aparece quando houver pelo menos duas avaliações.')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma avaliação registrada.')).toBeInTheDocument();
    expect(screen.queryByText('Como o Overall foi calculado')).not.toBeInTheDocument();
  });
});

describe('Registrar avaliação', () => {
  it('abre com as notas atuais, mostra a prévia do Overall e a variação', async () => {
    renderApp({ path: '/elenco/demo-p-08/avaliar' });
    expect(await screen.findByLabelText('Ataque ATA')).toHaveValue('91');
    expect(screen.getByText(/Overall calculado para ponteiro \(0 em relação à avaliação atual\)/)).toBeInTheDocument();
  });

  it('alterar um atributo atualiza a prévia ao vivo', async () => {
    const { user } = renderApp({ path: '/elenco/demo-p-08/avaliar' });
    const reception = await screen.findByLabelText('Recepção REC'); // peso alto para ponteiro
    await user.clear(reception);
    await user.type(reception, '99');
    // 82 -> 99 com peso 22%: +3,74 pontos, 85,1 -> 88,8 => 89 (+4)
    expect(screen.getByText(/\(\+4 em relação à avaliação atual\)/)).toBeInTheDocument();
  });

  it('salvar acrescenta uma avaliação e preserva o histórico anterior', async () => {
    const { user } = renderApp({ path: '/elenco/demo-p-08/avaliar' });
    const reception = await screen.findByLabelText('Recepção REC');
    await user.clear(reception);
    await user.type(reception, '99');
    await user.type(screen.getByLabelText('Quem avaliou'), 'Coach Teste');
    await user.type(screen.getByLabelText(/Observação da avaliação/), 'Recepção evoluiu muito');
    await user.click(screen.getByRole('button', { name: 'Salvar avaliação' }));

    expect(await screen.findByText(/Avaliação registrada\. As avaliações anteriores continuam no histórico\./)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Overall 89' })).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Recepção' })).toHaveAttribute('aria-valuenow', '99');
    // 6 avaliações de demonstração + a nova
    const items = history().getAllByRole('listitem');
    expect(items).toHaveLength(7);
    expect(items[0]).toHaveTextContent('Coach Teste');
    expect(items[0]).toHaveTextContent('Recepção evoluiu muito');
    expect(items[6]).toHaveTextContent('20 mai 2026');
    expect(items[6]).toHaveTextContent('80');
  });

  it('recusa nota inválida e data futura', async () => {
    const { user } = renderApp({ path: '/elenco/demo-p-08/avaliar' });
    const defense = await screen.findByLabelText('Defesa DEF');
    await user.clear(defense);
    await user.type(defense, '0');
    await user.type(screen.getByLabelText('Quem avaliou'), 'Coach Teste');
    const date = screen.getByLabelText('Data da avaliação');
    await user.clear(date);
    await user.type(date, '2099-01-01');
    await user.click(screen.getByRole('button', { name: 'Salvar avaliação' }));

    expect(await screen.findByText('Defesa: use um inteiro de 1 a 99.')).toBeInTheDocument();
    expect(screen.getByText('A data da avaliação não pode estar no futuro.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Registrar avaliação' })).toBeInTheDocument();
  });

  it('a data padrão é hoje e as notas não mudam sozinhas', async () => {
    renderApp({ path: '/elenco/demo-p-08/avaliar' });
    expect(await screen.findByLabelText('Data da avaliação')).toHaveValue(todayIso());
  });

  it('primeira avaliação de quem não tinha nenhuma passa a mostrar Overall e gráfico quando houver duas', async () => {
    const { user } = renderApp({ path: '/elenco/demo-p-18/avaliar' });
    await user.type(await screen.findByLabelText('Quem avaliou'), 'Coach Teste');
    await user.click(screen.getByRole('button', { name: 'Salvar avaliação' }));
    expect(await screen.findByText(/Avaliação registrada\./)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Overall 70' })).toBeInTheDocument();
    expect(screen.getByText('Só existe uma avaliação. A evolução aparece a partir da segunda.')).toBeInTheDocument();
  });
});
