import { createUniformAttributes } from './attributes';
import {
  currentOverall,
  evaluationsFor,
  latestEvaluation,
  playerToFormValues,
  shortName,
  validateEvaluationMeta,
  validatePlayerForm,
  type PlayerFormValues,
} from './player';
import { makeEvaluation, makePlayer } from '@/test/factories';

const valid: PlayerFormValues = {
  name: 'Gabriel Silva',
  jerseyNumber: '8',
  primaryPosition: 'ponteiro',
  secondaryPosition: 'oposto',
  status: 'ativo',
  uniform: 'purple',
  coachNotes: '',
};

describe('cadastro de jogador: validação', () => {
  it('aceita dados válidos e normaliza o texto', () => {
    const result = validatePlayerForm({ ...valid, name: '  Gabriel   Silva ', coachNotes: ' bom líder ' }, []);
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Gabriel Silva',
        jerseyNumber: 8,
        primaryPosition: 'ponteiro',
        secondaryPosition: 'oposto',
        status: 'ativo',
        uniform: 'purple',
        coachNotes: 'bom líder',
      },
    });
  });

  it('a posição secundária é opcional', () => {
    const result = validatePlayerForm({ ...valid, secondaryPosition: '' }, []);
    expect(result.ok && result.value.secondaryPosition).toBeNull();
  });

  it('exige nome com pelo menos 2 letras', () => {
    expect(validatePlayerForm({ ...valid, name: '  ' }, [])).toMatchObject({ ok: false, errors: { name: expect.any(String) } });
    expect(validatePlayerForm({ ...valid, name: 'A' }, [])).toMatchObject({ ok: false });
  });

  it('limita o tamanho do nome e das observações', () => {
    expect(validatePlayerForm({ ...valid, name: 'x'.repeat(61) }, []).ok).toBe(false);
    expect(validatePlayerForm({ ...valid, coachNotes: 'x'.repeat(501) }, []).ok).toBe(false);
  });

  it.each(['', 'abc', '0', '100', '-1', '8.5'])('rejeita o número de camisa "%s"', (jerseyNumber) => {
    const result = validatePlayerForm({ ...valid, jerseyNumber }, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.jerseyNumber).toBeDefined();
  });

  it('rejeita número de camisa já usado por outro atleta e diz quem o usa', () => {
    const holder = makePlayer({ name: 'Lucas Moreira', jerseyNumber: 8 });
    const result = validatePlayerForm(valid, [holder]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.jerseyNumber).toBe('Escolha outro número: o 8 já é de Lucas M.');
  });

  it('ao editar, o próprio atleta pode manter seu número', () => {
    const self = makePlayer({ name: 'Gabriel Silva', jerseyNumber: 8 });
    expect(validatePlayerForm(valid, [self], self.id).ok).toBe(true);
  });

  it('exige posição principal válida e secundária diferente da principal', () => {
    expect(validatePlayerForm({ ...valid, primaryPosition: '' }, []).ok).toBe(false);
    expect(validatePlayerForm({ ...valid, primaryPosition: 'goleiro' }, []).ok).toBe(false);
    const same = validatePlayerForm({ ...valid, secondaryPosition: 'ponteiro' }, []);
    expect(same.ok).toBe(false);
    if (!same.ok) expect(same.errors.secondaryPosition).toMatch(/diferente/);
  });

  it('rejeita situação e uniforme desconhecidos', () => {
    expect(validatePlayerForm({ ...valid, status: 'aposentado' }, []).ok).toBe(false);
    expect(validatePlayerForm({ ...valid, uniform: 'verde' }, []).ok).toBe(false);
  });

  it('reporta todos os erros de uma vez', () => {
    const result = validatePlayerForm({ ...valid, name: '', jerseyNumber: '', primaryPosition: '' }, []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors).sort()).toEqual(['jerseyNumber', 'name', 'primaryPosition']);
  });
});

describe('shortName', () => {
  it.each([
    ['Gabriel Silva', 'Gabriel S.'],
    ['  maria   da  costa  ', 'maria C.'],
    ['Pelé', 'Pelé'],
    ['', ''],
  ])('"%s" vira "%s"', (input, expected) => {
    expect(shortName(input)).toBe(expected);
  });
});

describe('playerToFormValues', () => {
  it('sem atleta, devolve o formulário em branco com padrões razoáveis', () => {
    expect(playerToFormValues()).toMatchObject({ name: '', jerseyNumber: '', status: 'ativo', uniform: 'purple' });
  });
});

describe('avaliações e Overall atual', () => {
  const player = makePlayer({ primaryPosition: 'ponteiro' });

  it('sem avaliação, o Overall é null (e nunca zero)', () => {
    expect(currentOverall(player, [])).toBeNull();
    expect(latestEvaluation([], player.id)).toBeNull();
  });

  it('usa a avaliação mais recente por data, não por ordem de inserção', () => {
    const newer = makeEvaluation(player.id, '2026-09-01', createUniformAttributes(80));
    const older = makeEvaluation(player.id, '2026-03-01', createUniformAttributes(50));
    const list = [newer, older];
    expect(latestEvaluation(list, player.id)).toBe(newer);
    expect(currentOverall(player, list)).toBe(80);
  });

  it('ignora avaliações de outros atletas', () => {
    const other = makePlayer();
    const evaluations = [makeEvaluation(other.id, '2026-05-01'), makeEvaluation(player.id, '2026-04-01')];
    expect(evaluationsFor(evaluations, player.id)).toHaveLength(1);
  });

  it('o histórico é preservado quando uma nova avaliação é registrada', () => {
    const first = makeEvaluation(player.id, '2026-04-01', createUniformAttributes(60));
    const history = [first];
    const second = makeEvaluation(player.id, '2026-05-01', createUniformAttributes(65));
    const updated = [...history, second];
    expect(evaluationsFor(updated, player.id)).toEqual([first, second]);
    expect(history).toEqual([first]);
  });
});

describe('validateEvaluationMeta', () => {
  const ok = { evaluatedAt: '2026-10-12', evaluator: 'Coach Silva', note: '' };

  it('aceita dados válidos', () => {
    expect(validateEvaluationMeta(ok, '2026-10-12').ok).toBe(true);
  });
  it('recusa data no futuro, data malformada e avaliador vazio', () => {
    expect(validateEvaluationMeta({ ...ok, evaluatedAt: '2026-10-13' }, '2026-10-12').ok).toBe(false);
    expect(validateEvaluationMeta({ ...ok, evaluatedAt: '12/10/2026' }, '2026-10-12').ok).toBe(false);
    expect(validateEvaluationMeta({ ...ok, evaluator: ' ' }, '2026-10-12').ok).toBe(false);
  });
});
