import {
  applyTrainingDraft,
  buildTrainingEvent,
  cascadeCounts,
  checkTrainingEdit,
  exerciseEventCount,
  lastValidEvent,
  participantEventCount,
  recentValidEvents,
  trainingToFormValues,
  validateTrainingForm,
  type ExerciseDraft,
  type RecordContext,
  type RecordRequest,
  type TrainingFormValues,
} from './training';
import { makeEvent, makeExercise, makePlayer, makeTraining } from '@/test/factories';

const valid: TrainingFormValues = {
  name: 'Transição e saque',
  date: '2026-10-12',
  duration: '90',
  description: 'Foco em saque float',
  notes: '',
  responsible: 'Coach Teste',
};

describe('validação do formulário de treino', () => {
  it('aceita dados válidos e normaliza textos, duração e participantes repetidos', () => {
    const result = validateTrainingForm({ ...valid, name: '  Transição   e saque ', responsible: ' Coach  Teste ' }, ['a', 'b', 'a'], []);
    expect(result).toEqual({
      ok: true,
      value: {
        name: 'Transição e saque',
        date: '2026-10-12',
        durationMinutes: 90,
        description: 'Foco em saque float',
        notes: '',
        responsible: 'Coach Teste',
        participantIds: ['a', 'b'],
        exercises: [],
      },
    });
  });

  it('duração é opcional e vira null quando em branco', () => {
    const result = validateTrainingForm({ ...valid, duration: '  ' }, [], []);
    expect(result.ok && result.value.durationMinutes).toBeNull();
  });

  it('exige nome com pelo menos 2 letras e no máximo 80', () => {
    expect(validateTrainingForm({ ...valid, name: ' a ' }, [], []).ok).toBe(false);
    expect(validateTrainingForm({ ...valid, name: 'x'.repeat(81) }, [], []).ok).toBe(false);
  });

  it.each(['', '12/10/2026', '2026-02-30', '2026-13-01', 'ontem'])('rejeita a data "%s"', (date) => {
    const result = validateTrainingForm({ ...valid, date }, [], []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.fields.date).toBeDefined();
  });

  it.each(['abc', '0', '601', '-5', '1.5', '90min'])('rejeita a duração "%s"', (duration) => {
    const result = validateTrainingForm({ ...valid, duration }, [], []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.fields.duration).toMatch(/1 a 600/);
  });

  it('limita descrição, observações e responsável', () => {
    expect(validateTrainingForm({ ...valid, description: 'x'.repeat(501) }, [], []).ok).toBe(false);
    expect(validateTrainingForm({ ...valid, notes: 'x'.repeat(1001) }, [], []).ok).toBe(false);
    expect(validateTrainingForm({ ...valid, responsible: 'x'.repeat(61) }, [], []).ok).toBe(false);
  });

  it('valida exercícios: nome mínimo, sem repetição (ignora caixa) e erro por posição', () => {
    const exercises: ExerciseDraft[] = [
      { id: null, name: 'Saque em zonas', focus: 'saque' },
      { id: null, name: 'x', focus: '' },
      { id: null, name: ' saque EM zonas ', focus: '' },
    ];
    const result = validateTrainingForm(valid, [], exercises);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors.exercises)).toEqual(['1', '2']);
      expect(result.errors.exercises[2]).toMatch(/Já existe/);
    }
  });

  it('mantém o id de exercícios existentes e traduz foco vazio para null', () => {
    const result = validateTrainingForm(valid, [], [
      { id: 'x1', name: 'Saque em zonas', focus: 'saque' },
      { id: null, name: 'Jogo reduzido', focus: '' },
    ]);
    expect(result.ok && result.value.exercises).toEqual([
      { id: 'x1', name: 'Saque em zonas', focus: 'saque' },
      { id: null, name: 'Jogo reduzido', focus: null },
    ]);
  });

  it('reporta vários erros de uma vez', () => {
    const result = validateTrainingForm({ ...valid, name: '', date: '', duration: 'x' }, [], []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(Object.keys(result.errors.fields).sort()).toEqual(['date', 'duration', 'name']);
  });

  it('trainingToFormValues devolve o formulário em branco sem treino', () => {
    expect(trainingToFormValues()).toMatchObject({ name: '', date: '', duration: '' });
    expect(trainingToFormValues(makeTraining({ durationMinutes: null })).duration).toBe('');
    expect(trainingToFormValues(makeTraining({ durationMinutes: 75 })).duration).toBe('75');
  });
});

describe('applyTrainingDraft: criação e edição', () => {
  const idGen = (() => {
    let n = 0;
    return (prefix: string) => `${prefix}-${++n}`;
  })();
  const draft = {
    name: 'Novo',
    date: '2026-10-12',
    durationMinutes: 60,
    description: '',
    notes: '',
    responsible: '',
    participantIds: ['p1'],
    exercises: [
      { id: null, name: 'A', focus: null },
      { id: 'x-old', name: 'B', focus: 'saque' as const },
    ],
  };

  it('criação: gera id próprio, treino aberto, exercícios ligados ao treino e em ordem', () => {
    const { training, exercises } = applyTrainingDraft(null, draft, '2026-10-12T10:00:00.000Z', idGen);
    expect(training.id).toMatch(/^training-/);
    expect(training.status).toBe('aberto');
    expect(training.completedAt).toBeNull();
    expect(training.demo).toBe(false);
    expect(exercises.map((e) => e.trainingId)).toEqual([training.id, training.id]);
    expect(exercises.map((e) => e.order)).toEqual([0, 1]);
    expect(exercises[0]!.id).toMatch(/^exercise-/);
    expect(exercises[1]!.id).toBe('x-old');
  });

  it('edição: preserva id, criação, status e conclusão; só muda os campos editados', () => {
    const existing = makeTraining({ id: 't-keep', status: 'concluido', completedAt: '2026-10-11T20:00:00.000Z', createdAt: '2026-10-01T00:00:00.000Z', demo: true });
    const { training } = applyTrainingDraft(existing, { ...draft, name: 'Renomeado' }, '2026-10-12T10:00:00.000Z', idGen);
    expect(training).toMatchObject({
      id: 't-keep',
      name: 'Renomeado',
      status: 'concluido',
      completedAt: '2026-10-11T20:00:00.000Z',
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-12T10:00:00.000Z',
      demo: true,
    });
  });

  it('editar nome e descrição não toca nos registros (eles ficam em outra coleção)', () => {
    const training = makeTraining({ id: 'tt', participantIds: ['p1'] });
    const exercise = makeExercise('tt', { id: 'xx' });
    const events = [makeEvent('tt', 'xx', 'p1', 'saque', 'ace')];
    const snapshot = JSON.stringify(events);
    const { exercises } = applyTrainingDraft(
      training,
      { ...draft, name: 'Outro nome', description: 'Nova descrição', exercises: [{ id: 'xx', name: exercise.name, focus: null }] },
      'now',
      idGen,
    );
    expect(exercises[0]!.id).toBe('xx');
    expect(JSON.stringify(events)).toBe(snapshot);
  });
});

describe('integridade nas edições', () => {
  const p1 = makePlayer({ id: 'p1', name: 'Gabriel Silva' });
  const p2 = makePlayer({ id: 'p2', name: 'Lucas Moreira' });
  const training = makeTraining({ id: 'tr', participantIds: ['p1', 'p2'] });
  const ex1 = makeExercise('tr', { id: 'e1', name: 'Saque' });
  const ex2 = makeExercise('tr', { id: 'e2', name: 'Ataque' });
  const events = [makeEvent('tr', 'e1', 'p1', 'saque', 'ace')];
  const keepAll = { participantIds: ['p1', 'p2'], exercises: [{ id: 'e1', name: 'Saque', focus: null }, { id: 'e2', name: 'Ataque', focus: null }] };

  it('edição segura retorna null', () => {
    expect(checkTrainingEdit(training, keepAll, [ex1, ex2], events, [p1, p2])).toBeNull();
  });

  it('remove exercício sem registros: permitido', () => {
    expect(checkTrainingEdit(training, { ...keepAll, exercises: [keepAll.exercises[0]!] }, [ex1, ex2], events, [p1, p2])).toBeNull();
  });

  it('remove exercício com registros: bloqueado com mensagem clara', () => {
    const message = checkTrainingEdit(training, { ...keepAll, exercises: [keepAll.exercises[1]!] }, [ex1, ex2], events, [p1, p2]);
    expect(message).toBe('O exercício "Saque" tem 1 registro e não pode ser removido. Renomeie-o ou exclua o treino inteiro.');
  });

  it('remove participante sem registros: permitido; com registros válidos: bloqueado', () => {
    expect(checkTrainingEdit(training, { ...keepAll, participantIds: ['p1'] }, [ex1, ex2], events, [p1, p2])).toBeNull();
    expect(checkTrainingEdit(training, { ...keepAll, participantIds: ['p2'] }, [ex1, ex2], events, [p1, p2])).toMatch(
      /Gabriel Silva tem 1 registro válido neste treino/,
    );
  });

  it('participante cujos registros foram todos desfeitos pode sair', () => {
    const voided = [makeEvent('tr', 'e1', 'p1', 'saque', 'ace', { voidedAt: '2026-10-01T11:00:00.000Z' })];
    expect(checkTrainingEdit(training, { ...keepAll, participantIds: ['p2'] }, [ex1, ex2], voided, [p1, p2])).toBeNull();
  });

  it('contagens de registros por exercício e por participante só consideram o que é do treino', () => {
    const other = makeEvent('outro', 'e9', 'p1', 'saque', 'valido');
    expect(exerciseEventCount([...events, other], 'e1')).toBe(1);
    expect(participantEventCount([...events, other], 'tr', 'p1')).toBe(1);
  });

  it('cascadeCounts conta exercícios e registros (válidos e anulados) do treino', () => {
    const voided = makeEvent('tr', 'e1', 'p1', 'saque', 'erro', { voidedAt: 'x' });
    const foreignExercise = makeExercise('outro');
    expect(cascadeCounts('tr', [ex1, ex2, foreignExercise], [...events, voided, makeEvent('outro', 'e9', 'p1', 'saque', 'ace')])).toEqual({
      exercises: 2,
      events: 2,
    });
  });
});

describe('buildTrainingEvent: associação e integridade', () => {
  const p1 = makePlayer({ id: 'p1' });
  const outsider = makePlayer({ id: 'p9' });
  const training = makeTraining({ id: 'tr', participantIds: ['p1'] });
  const exercise = makeExercise('tr', { id: 'ex' });
  const foreign = makeExercise('outro-treino', { id: 'ex-fora' });
  const context: RecordContext = { trainings: [training], exercises: [exercise, foreign], events: [], players: [p1, outsider] };
  const request: RecordRequest = {
    id: 'ev-1',
    trainingId: 'tr',
    exerciseId: 'ex',
    playerId: 'p1',
    fundamental: 'recepcao',
    outcome: 'A',
    attemptKey: 'key-1',
    recordedAt: '2026-10-12T19:00:00.000Z',
  };

  it('cria o evento vinculado a treino, exercício e atleta corretos, com data e hora', () => {
    const result = buildTrainingEvent(request, context);
    expect(result.ok && result.event).toMatchObject({
      id: 'ev-1',
      trainingId: 'tr',
      exerciseId: 'ex',
      playerId: 'p1',
      fundamental: 'recepcao',
      outcome: 'A',
      recordedAt: '2026-10-12T19:00:00.000Z',
      voidedAt: null,
      demo: false,
    });
    expect(result.ok && result.duplicate).toBe(false);
  });

  it('a mesma attemptKey não duplica: devolve o evento original', () => {
    const first = buildTrainingEvent(request, context);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = buildTrainingEvent({ ...request, id: 'ev-2' }, { ...context, events: [first.event] });
    expect(again.ok && again.duplicate).toBe(true);
    expect(again.ok && again.event.id).toBe('ev-1');
  });

  it('a repetição é reconhecida mesmo se o treino foi concluído depois', () => {
    const first = buildTrainingEvent(request, context);
    if (!first.ok) throw new Error('esperado ok');
    const closed = { ...context, trainings: [{ ...training, status: 'concluido' as const }], events: [first.event] };
    expect(buildTrainingEvent(request, closed).ok).toBe(true);
  });

  it.each([
    ['treino inexistente', { trainingId: 'fantasma' }, /não existe mais/],
    ['exercício inexistente', { exerciseId: 'fantasma' }, /não pertence ao treino/],
    ['exercício de outro treino', { exerciseId: 'ex-fora' }, /não pertence ao treino/],
    ['atleta inexistente', { playerId: 'fantasma' }, /não existe mais no elenco/],
    ['atleta que não participa do treino', { playerId: 'p9' }, /não participa do treino/],
    ['resultado de outro fundamento', { outcome: 'ace' }, /Resultado inválido/],
    ['fundamento desconhecido', { fundamental: 'cortada' }, /Resultado inválido/],
    ['sem chave de tentativa', { attemptKey: '  ' }, /chave de tentativa/],
  ] as const)('recusa %s', (_name, patch, message) => {
    const result = buildTrainingEvent({ ...request, ...patch }, context);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(message);
  });

  it('recusa registrar em treino concluído', () => {
    const result = buildTrainingEvent(request, { ...context, trainings: [{ ...training, status: 'concluido' }] });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/concluído/);
  });
});

describe('ordem dos eventos e desfazer', () => {
  const at = (n: number) => `2026-10-01T10:00:0${n}.000Z`;
  const a = makeEvent('tr', 'e', 'p', 'saque', 'ace', { recordedAt: at(1) });
  const b = makeEvent('tr', 'e', 'p', 'saque', 'valido', { recordedAt: at(2) });
  const c = makeEvent('tr', 'e', 'p', 'saque', 'erro', { recordedAt: at(3) });
  const outro = makeEvent('outro', 'e', 'p', 'saque', 'ace', { recordedAt: at(9) });

  it('último evento válido é o mais recente do treino, ignorando outros treinos', () => {
    expect(lastValidEvent([a, b, c, outro], 'tr')).toBe(c);
  });

  it('eventos anulados são ignorados: o anterior passa a ser o último', () => {
    expect(lastValidEvent([a, b, { ...c, voidedAt: 'x' }], 'tr')).toBe(b);
    expect(lastValidEvent([{ ...a, voidedAt: 'x' }], 'tr')).toBeNull();
    expect(lastValidEvent([], 'tr')).toBeNull();
  });

  it('não depende da ordem do array', () => {
    expect(lastValidEvent([c, a, b], 'tr')).toBe(c);
  });

  it('empate de horário usa a ordem de inserção', () => {
    const x = makeEvent('tr', 'e', 'p', 'saque', 'ace', { recordedAt: at(5) });
    const y = makeEvent('tr', 'e', 'p', 'saque', 'erro', { recordedAt: at(5) });
    expect(lastValidEvent([x, y], 'tr')).toBe(y);
  });

  it('recentValidEvents devolve os mais novos primeiro e respeita o limite', () => {
    expect(recentValidEvents([a, b, c], 'tr', 2)).toEqual([c, b]);
    expect(recentValidEvents([a, b, { ...c, voidedAt: 'x' }], 'tr', 5)).toEqual([b, a]);
  });
});
