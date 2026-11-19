import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { MatchSet } from '@/domain/match';
import { makePlayer } from '@/test/factories';
import { RotationCourt } from './RotationCourt';

const NAMES = ['Ana Alves', 'Bia Borges', 'Cris Costa', 'Dani Dias', 'Eva Esteves', 'Fabi Faria'];
const players = NAMES.map((name, i) => makePlayer({ id: `p${i + 1}`, name, jerseyNumber: i + 1 }));
const playersById = new Map(players.map((p) => [p.id, p]));
const roles = ['levantador', 'oposto', 'ponteiro', 'central', 'ponteiro', 'central'] as const;
const set: MatchSet = {
  matchId: 'm1',
  number: 1,
  firstServer: 'us',
  starters: roles.map((role, slot) => ({ slot, playerId: `p${slot + 1}`, role })),
  liberoId: null,
  createdAt: '2026-10-01T10:00:00.000Z',
};

const court = (props: Partial<React.ComponentProps<typeof RotationCourt>> = {}) =>
  render(<RotationCourt set={set} rotation={0} servingSide="us" playersById={playersById} {...props} />);

describe('RotationCourt', () => {
  it('sem onSelect é só leitura: nomes na formação e nenhum botão', () => {
    court();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(within(screen.getByRole('list', { name: 'Formação na rotação 1' })).getAllByRole('listitem')).toHaveLength(6);
  });

  it('com onSelect, cada posição é um botão com o nome do atleta e a posição na descrição', () => {
    court({ onSelect: () => undefined, selectedId: null });
    const buttons = screen.getAllByRole('button');
    expect(buttons).toHaveLength(6);
    const ana = screen.getByRole('button', { name: 'Ana A. #1' });
    expect(ana).toHaveAccessibleDescription('posição P1, Levantador');
    expect(screen.getByRole('button', { name: 'Bia B. #2' })).toHaveAccessibleDescription('posição P2, Oposto');
  });

  it('marca o selecionado com aria-pressed e chama onSelect com o id ao tocar', async () => {
    const onSelect = vi.fn();
    court({ onSelect, selectedId: 'p3' });
    expect(screen.getByRole('button', { name: 'Cris C. #3' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Ana A. #1' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'Bia B. #2' }));
    expect(onSelect).toHaveBeenCalledWith('p2');
  });

  it('acompanha a rotação: com rotação 1, quem estava em P2 vai para P1', () => {
    court({ onSelect: () => undefined, rotation: 1 });
    expect(screen.getByRole('button', { name: 'Bia B. #2' })).toHaveAccessibleDescription('posição P1, Oposto');
  });

  it('posição sem atleta no elenco fica desabilitada e não quebra', () => {
    const withoutBia = new Map(playersById);
    withoutBia.delete('p2');
    court({ onSelect: () => undefined, playersById: withoutBia });
    const disabled = screen.getAllByRole('button').filter((b) => (b as HTMLButtonElement).disabled);
    expect(disabled).toHaveLength(1);
    expect(screen.getAllByRole('button')).toHaveLength(6);
  });
});
