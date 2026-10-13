import {
  assignStarter,
  clearStarter,
  COURT_SLOTS,
  createEmptyLineup,
  defaultRoleFor,
  roleInLineup,
  rotateStarters,
  selectedPlayerIds,
  servingOrder,
  setLibero,
  setStarterRole,
  starterAt,
  starterCount,
  starterSlotOf,
  swapStarters,
  toggleBench,
  validateLineup,
  type Lineup,
  type LineupChange,
} from './lineup';
import { makePlayer } from '@/test/factories';

const setter = makePlayer({ name: 'Lucas Moreira', primaryPosition: 'levantador' });
const opposite = makePlayer({ name: 'Felipe Barros', primaryPosition: 'oposto' });
const outside1 = makePlayer({ name: 'Gabriel Silva', primaryPosition: 'ponteiro' });
const outside2 = makePlayer({ name: 'Murilo Vaz', primaryPosition: 'ponteiro' });
const middle1 = makePlayer({ name: 'Vitor Klein', primaryPosition: 'central' });
const middle2 = makePlayer({ name: 'Pedro Almeida', primaryPosition: 'central' });
const libero = makePlayer({ name: 'Danilo Ferraz', primaryPosition: 'libero' });
const spare = makePlayer({ name: 'Rafael Lopes', primaryPosition: 'levantador' });
const six = [setter, opposite, outside1, outside2, middle1, middle2];
const everyone = [...six, libero, spare];

function must(change: LineupChange): Lineup {
  if (!change.ok) throw new Error(change.reason);
  return change.lineup;
}

function fullLineup(): Lineup {
  let lineup = createEmptyLineup('l1', '2026-10-01T00:00:00.000Z');
  six.forEach((player, index) => {
    lineup = must(assignStarter(lineup, COURT_SLOTS[index]!, player));
  });
  return lineup;
}

describe('seleção dos seis titulares', () => {
  it('começa vazia', () => {
    const lineup = createEmptyLineup('l1', 'now');
    expect(starterCount(lineup)).toBe(0);
    expect(lineup.starters).toHaveLength(6);
  });

  it('coloca um atleta numa zona com o papel tático igual à posição habitual', () => {
    const lineup = must(assignStarter(createEmptyLineup('l1', 'now'), 1, setter));
    expect(starterAt(lineup, 1)).toEqual({ playerId: setter.id, role: 'levantador' });
    expect(starterSlotOf(lineup, setter.id)).toBe(1);
  });

  it('completa seis titulares sem duplicar ninguém', () => {
    const lineup = fullLineup();
    expect(starterCount(lineup)).toBe(6);
    const ids = selectedPlayerIds(lineup);
    expect(new Set(ids).size).toBe(6);
  });

  it('colocar o mesmo atleta em outra zona vazia o MOVE em vez de duplicá-lo', () => {
    let lineup = must(assignStarter(createEmptyLineup('l1', 'now'), 1, setter));
    lineup = must(assignStarter(lineup, 4, setter));
    expect(starterAt(lineup, 1)).toBeNull();
    expect(starterSlotOf(lineup, setter.id)).toBe(4);
    expect(starterCount(lineup)).toBe(1);
  });

  it('mover um titular para uma zona ocupada troca os dois de lugar', () => {
    let lineup = must(assignStarter(createEmptyLineup('l1', 'now'), 1, setter));
    lineup = must(assignStarter(lineup, 2, opposite));
    lineup = must(assignStarter(lineup, 2, setter));
    expect(starterSlotOf(lineup, setter.id)).toBe(2);
    expect(starterSlotOf(lineup, opposite.id)).toBe(1);
    expect(starterCount(lineup)).toBe(2);
  });

  it('um novo atleta sobre uma zona ocupada substitui o ocupante, que fica fora da escalação', () => {
    let lineup = must(assignStarter(createEmptyLineup('l1', 'now'), 1, setter));
    lineup = must(assignStarter(lineup, 1, spare));
    expect(starterAt(lineup, 1)?.playerId).toBe(spare.id);
    expect(roleInLineup(lineup, setter.id)).toBeNull();
  });

  it('um reserva promovido a titular sai do banco', () => {
    let lineup = toggleBench(createEmptyLineup('l1', 'now'), spare.id);
    expect(lineup.benchIds).toEqual([spare.id]);
    lineup = must(assignStarter(lineup, 3, spare));
    expect(lineup.benchIds).toEqual([]);
    expect(roleInLineup(lineup, spare.id)).toBe('titular');
  });

  it('o líbero de ofício não ocupa zona de quadra e a recusa explica o motivo', () => {
    const change = assignStarter(createEmptyLineup('l1', 'now'), 5, libero);
    expect(change.ok).toBe(false);
    if (!change.ok) expect(change.reason).toMatch(/líbero/i);
  });

  it('um atleta com posição secundária de linha pode atuar na quadra', () => {
    const hybrid = makePlayer({ primaryPosition: 'libero', secondaryPosition: 'ponteiro' });
    expect(defaultRoleFor(hybrid)).toBe('ponteiro');
    expect(assignStarter(createEmptyLineup('l1', 'now'), 5, hybrid).ok).toBe(true);
  });

  it('corrige a seleção: limpar uma zona libera o atleta', () => {
    const lineup = clearStarter(fullLineup(), 3);
    expect(starterAt(lineup, 3)).toBeNull();
    expect(starterCount(lineup)).toBe(5);
  });

  it('troca duas zonas e permite trocar o papel tático sem mudar a posição habitual', () => {
    let lineup = swapStarters(fullLineup(), 1, 4);
    expect(starterAt(lineup, 1)?.playerId).toBe(outside2.id);
    expect(starterAt(lineup, 4)?.playerId).toBe(setter.id);
    lineup = setStarterRole(lineup, 4, 'oposto');
    expect(starterAt(lineup, 4)?.role).toBe('oposto');
    expect(setter.primaryPosition).toBe('levantador');
  });

  it('não altera o objeto original (imutabilidade)', () => {
    const before = fullLineup();
    const snapshot = JSON.stringify(before);
    clearStarter(before, 1);
    swapStarters(before, 1, 2);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe('líbero e reservas', () => {
  it('definir o líbero o tira de titular e de reserva', () => {
    let lineup = toggleBench(fullLineup(), libero.id);
    lineup = setLibero(lineup, libero.id);
    expect(lineup.liberoId).toBe(libero.id);
    expect(lineup.benchIds).toEqual([]);

    const promoted = setLibero(fullLineup(), outside1.id);
    expect(starterSlotOf(promoted, outside1.id)).toBeNull();
    expect(promoted.liberoId).toBe(outside1.id);
  });

  it('setLibero(null) remove o líbero', () => {
    expect(setLibero(setLibero(fullLineup(), libero.id), null).liberoId).toBeNull();
  });

  it('quem é titular ou líbero não vira reserva', () => {
    const lineup = setLibero(fullLineup(), libero.id);
    expect(toggleBench(lineup, setter.id).benchIds).toEqual([]);
    expect(toggleBench(lineup, libero.id).benchIds).toEqual([]);
  });

  it('alterna reservas: adiciona e remove', () => {
    let lineup = toggleBench(fullLineup(), spare.id);
    expect(lineup.benchIds).toEqual([spare.id]);
    lineup = toggleBench(lineup, spare.id);
    expect(lineup.benchIds).toEqual([]);
  });

  it('ao entrar como titular, o líbero atual deixa a vaga de líbero', () => {
    const hybrid = makePlayer({ primaryPosition: 'libero', secondaryPosition: 'ponteiro' });
    let lineup = setLibero(createEmptyLineup('l1', 'now'), hybrid.id);
    lineup = must(assignStarter(lineup, 1, hybrid));
    expect(lineup.liberoId).toBeNull();
  });
});

describe('ordem de saque e rodízio', () => {
  it('a ordem base de saque segue P1, P2, ... P6', () => {
    const order = servingOrder(fullLineup());
    expect(order.map((e) => e.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(order[0]?.starter.playerId).toBe(setter.id);
  });

  it('em escalação parcial lista só as zonas preenchidas', () => {
    const lineup = must(assignStarter(createEmptyLineup('l1', 'now'), 4, setter));
    expect(servingOrder(lineup).map((e) => e.slot)).toEqual([4]);
  });

  it('um rodízio leva quem estava em P2 para P1 (e P1 para P6)', () => {
    const start = fullLineup().starters; // P1..P6 = setter, opposite, outside1, outside2, middle1, middle2
    const after = rotateStarters(start, 1);
    expect(after[0]?.playerId).toBe(opposite.id); // P2 -> P1
    expect(after[5]?.playerId).toBe(setter.id); // P1 -> P6
    expect(after[4]?.playerId).toBe(middle2.id); // P6 -> P5
    expect(after[1]?.playerId).toBe(outside1.id); // P3 -> P2
  });

  it('seis rodízios devolvem a formação inicial e rodízio negativo desfaz', () => {
    const start = fullLineup().starters;
    expect(rotateStarters(start, 6)).toEqual(start);
    expect(rotateStarters(rotateStarters(start, 1), -1)).toEqual(start);
  });

  it('o rodízio não perde nem duplica atletas', () => {
    const ids = rotateStarters(fullLineup().starters, 3).map((s) => s?.playerId);
    expect(new Set(ids).size).toBe(6);
  });
});

describe('validateLineup', () => {
  it('uma escalação completa e coerente não tem erros nem avisos', () => {
    expect(validateLineup(fullLineup(), everyone)).toEqual({ errors: [], warnings: [] });
  });

  it('exige seis titulares e informa quantos faltam', () => {
    const lineup = clearStarter(clearStarter(fullLineup(), 1), 2);
    expect(validateLineup(lineup, everyone).errors).toContain('Faltam 2 titulares para completar os seis.');
    expect(validateLineup(clearStarter(fullLineup(), 1), everyone).errors).toContain(
      'Faltam 1 titular para completar os seis.',
    );
  });

  it('exige nome para a escalação', () => {
    const lineup = { ...fullLineup(), title: '   ' };
    expect(validateLineup(lineup, everyone).errors).toContain('Dê um nome para a escalação.');
  });

  it('detecta atleta repetido (defesa contra dados corrompidos)', () => {
    const lineup = { ...fullLineup(), benchIds: [setter.id] };
    expect(validateLineup(lineup, everyone).errors).toContain('Há atleta repetido na escalação.');
  });

  it('detecta atleta que saiu do elenco', () => {
    expect(validateLineup(fullLineup(), [libero]).errors).toContain('Há atleta que não está mais no elenco.');
  });

  it('avisa (sem bloquear) sobre atleta lesionado, líbero improvisado e formação incoerente', () => {
    const hurt = makePlayer({ name: 'Samuel Duarte', primaryPosition: 'oposto', status: 'lesionado' });
    let lineup = must(assignStarter(fullLineup(), 2, hurt));
    lineup = setLibero(lineup, outside1.id); // ponteiro como líbero
    lineup = { ...lineup, starters: lineup.starters };
    const report = validateLineup(lineup, [...everyone, hurt]);
    expect(report.warnings.some((w) => w.includes('Samuel D.') && w.includes('Lesionado'))).toBe(true);
    expect(report.warnings.some((w) => w.includes('Gabriel S.') && w.includes('líbero'))).toBe(true);
  });

  it('avisa quando a formação 5-1 não tem exatamente um levantador', () => {
    const noSetter = setStarterRole(fullLineup(), 1, 'oposto');
    expect(validateLineup(noSetter, everyone).warnings.join(' ')).toMatch(/5-1 usa 1 levantador; a escalação tem 0/);
    const twoSetters = { ...fullLineup(), formation: '6-2' as const };
    expect(validateLineup(twoSetters, everyone).warnings.join(' ')).toMatch(/6-2 usa 2 levantadores; a escalação tem 1/);
  });

  it('avisa quando o papel tático foge das posições habituais do atleta', () => {
    const lineup = setStarterRole(fullLineup(), 3, 'central');
    expect(validateLineup(lineup, everyone).warnings.join(' ')).toMatch(/Gabriel S\. está como central/);
  });
});
