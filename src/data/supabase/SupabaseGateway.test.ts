/**
 * Testes do SupabaseGateway contra o cliente SIMULADO (src/test/fakeSupabase.ts). Provam que o código do
 * aplicativo traduz, restringe à equipe e trata erros corretamente. NÃO provam que a RLS real funciona: isso é
 * coberto por supabase/tests/rls.test.sql, executado no banco de verdade.
 */
import { createUniformAttributes } from '@/domain/attributes';
import { createEmptyLineup } from '@/domain/lineup';
import { DEFAULT_OVERALL_WEIGHTS, cloneWeights } from '@/domain/overall';
import { makeEvaluation, makeEvent, makeExercise, makePlayer, makeTraining } from '@/test/factories';
import { TEAM_A, TEAM_B, USERS, gatewayFor, newFake, seedTeam, seedWorkspace } from '@/test/remoteFixtures';
import {
  IntegrityError,
  PermissionDeniedError,
  RemoteDataError,
  RemoteOperationUnavailableError,
  RemoteUnavailableError,
  SessionExpiredError,
} from '../gateway';
import { createEmptyWorkspace } from '../demo';
import { mapRemoteError } from './SupabaseGateway';

const NOW = '2026-10-01T10:00:00.000Z';

function world() {
  const players = [
    makePlayer({ id: 'p1', name: 'Ana Alves', jerseyNumber: 1, primaryPosition: 'levantador' }),
    makePlayer({ id: 'p2', name: 'Bia Borges', jerseyNumber: 2 }),
    makePlayer({ id: 'p3', name: 'Cris Costa', jerseyNumber: 3, primaryPosition: 'libero' }),
  ];
  const training = makeTraining({ id: 't1', name: 'Treino A', participantIds: ['p1', 'p2'] });
  const ex1 = makeExercise('t1', { id: 'x1', name: 'Saque', order: 0, focus: 'saque' });
  const ex2 = makeExercise('t1', { id: 'x2', name: 'Ataque', order: 1, focus: 'ataque' });
  const ev1 = makeEvent('t1', 'x1', 'p1', 'saque', 'ace', { id: 'e1', attemptKey: 'k1' });
  const evaluations = [
    makeEvaluation('p1', '2026-08-01', createUniformAttributes(60), { id: 'ev-a' }),
    makeEvaluation('p1', '2026-09-01', createUniformAttributes(70), { id: 'ev-b' }),
  ];
  const fake = newFake();
  seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach', analyst: 'analyst', viewer: 'viewer' });
  seedWorkspace(fake, TEAM_A, { players, evaluations, trainings: [training], exercises: [ex1, ex2], trainingEvents: [ev1] });
  return { fake, players, training, ex1, ex2, ev1, evaluations };
}

const snapshotDb = (fake: ReturnType<typeof newFake>) => structuredClone(fake.db);

describe('SupabaseGateway: leitura', () => {
  it('uma equipe nova abre vazia, com pesos padrão, sem atividade e SEM demonstração', async () => {
    const fake = newFake();
    seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach' });
    const ws = await gatewayFor(fake, 'coach').load();
    expect(ws.players).toEqual([]);
    expect(ws.trainings).toEqual([]);
    expect(ws.activity).toBeNull();
    expect(ws.settings.weights).toEqual(DEFAULT_OVERALL_WEIGHTS);
  });

  it('preserva ids, histórico de avaliações e vínculos treino ↔ exercícios ↔ participantes ↔ registros', async () => {
    const { fake, training, evaluations } = world();
    const ws = await gatewayFor(fake, 'coach').load();
    expect(ws.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect(ws.evaluations.map((e) => e.id)).toEqual(['ev-a', 'ev-b']);
    expect(ws.evaluations[0]?.attributes).toEqual(evaluations[0]?.attributes);
    expect(ws.trainings).toHaveLength(1);
    expect(ws.trainings[0]).toMatchObject({ id: 't1', name: training.name, date: '2026-10-01', status: 'aberto', demo: false });
    expect([...(ws.trainings[0]?.participantIds ?? [])].sort()).toEqual(['p1', 'p2']);
    expect(ws.exercises.map((e) => [e.id, e.trainingId, e.order])).toEqual([['x1', 't1', 0], ['x2', 't1', 1]]);
    expect(ws.trainingEvents[0]).toMatchObject({ id: 'e1', trainingId: 't1', exerciseId: 'x1', playerId: 'p1', fundamental: 'saque', outcome: 'ace', attemptKey: 'k1', voidedAt: null });
  });

  it('converte datas do banco (+00:00) para o ISO do aplicativo', async () => {
    const { fake } = world();
    const row = fake.db.players?.[0];
    if (!row) throw new Error('sem jogador');
    row.created_at = '2026-01-01T00:00:00+00:00';
    const ws = await gatewayFor(fake, 'coach').load();
    expect(ws.players[0]?.createdAt).toBe('2026-01-01T00:00:00.000Z');
  });

  it('traz só a equipe aberta, e TODA consulta de leitura é restrita a ela', async () => {
    const { fake } = world();
    seedTeam(fake, TEAM_B, 'Equipe B', { coach: 'coach' });
    seedWorkspace(fake, TEAM_B, { players: [makePlayer({ id: 'pb', name: 'Bruna B.', jerseyNumber: 9 })] });
    const ws = await gatewayFor(fake, 'coach', TEAM_A).load();
    expect(ws.players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    const reads = fake.calls.filter((c) => c.op === 'select');
    expect(reads.length).toBeGreaterThanOrEqual(10);
    expect(reads.every((c) => c.eq.team_id === TEAM_A)).toBe(true);
  });

  it('lê em páginas: mais de 1000 registros chegam completos (o servidor corta em 1000 por requisição)', async () => {
    const { fake } = world();
    const events = Array.from({ length: 2500 }, (_, i) =>
      makeEvent('t1', 'x1', 'p1', 'saque', 'valido', {
        id: `bulk-${String(i).padStart(5, '0')}`,
        attemptKey: `bulk-key-${i}`,
        recordedAt: new Date(Date.UTC(2026, 9, 1, 12, 0, i % 60, 0) + Math.floor(i / 60) * 60_000).toISOString(),
      }),
    );
    seedWorkspace(fake, TEAM_A, { trainingEvents: events });
    const ws = await gatewayFor(fake, 'coach').load();
    expect(ws.trainingEvents).toHaveLength(2501);
    expect(new Set(ws.trainingEvents.map((e) => e.id)).size).toBe(2501);
  });

  it('dado fora do formato vira erro explícito, não coerção silenciosa', async () => {
    const { fake } = world();
    const row = fake.db.players?.[0];
    if (row) row.primary_position = 'goleiro';
    await expect(gatewayFor(fake, 'coach').load()).rejects.toBeInstanceOf(RemoteDataError);
  });

  it('quem não é membro da equipe não recebe dado nenhum (simulação do filtro de leitura)', async () => {
    const { fake } = world();
    const ws = await gatewayFor(fake, 'outsider').load();
    expect(ws.players).toEqual([]);
    expect(ws.trainings).toEqual([]);
  });
});

describe('SupabaseGateway: elenco, avaliações e pesos', () => {
  it('cria e edita atleta preservando o id e sem duplicar', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'coach');
    const novo = makePlayer({ id: 'p9', name: 'Dani Dias', jerseyNumber: 9 });
    await gw.savePlayer(novo);
    await gw.savePlayer({ ...novo, name: 'Daniela Dias', status: 'lesionado' });
    const ws = await gw.load();
    expect(ws.players.filter((p) => p.id === 'p9')).toHaveLength(1);
    expect(ws.players.find((p) => p.id === 'p9')).toMatchObject({ name: 'Daniela Dias', status: 'lesionado' });
  });

  it('camisa já usada por outro atleta é recusada com mensagem clara e nada muda', async () => {
    const { fake } = world();
    const before = snapshotDb(fake);
    const gw = gatewayFor(fake, 'coach');
    await expect(gw.savePlayer(makePlayer({ id: 'p9', jerseyNumber: 1 }))).rejects.toThrow(/número de camisa já está em uso/);
    expect(fake.db).toEqual(before);
  });

  it('a avaliação é acrescentada e o histórico anterior fica intacto', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'analyst');
    await gw.addEvaluation(makeEvaluation('p2', '2026-10-05', createUniformAttributes(80), { id: 'ev-c' }));
    const ws = await gw.load();
    expect(ws.evaluations.map((e) => e.id)).toEqual(['ev-a', 'ev-b', 'ev-c']);
    expect(ws.evaluations[2]?.attributes.SAC).toBe(80);
  });

  it('avaliação de atleta que não existe é recusada pela integridade', async () => {
    const { fake } = world();
    await expect(gatewayFor(fake, 'coach').addEvaluation(makeEvaluation('fantasma', '2026-10-05'))).rejects.toBeInstanceOf(IntegrityError);
  });

  it('os pesos do Overall vão e voltam inteiros (cinco posições numa só gravação)', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'coach');
    const weights = cloneWeights(DEFAULT_OVERALL_WEIGHTS);
    weights.ponteiro.SAC = 40;
    await gw.saveSettings({ weights });
    expect((await gw.load()).settings.weights).toEqual(weights);
    expect(fake.rows('overall_weights', TEAM_A)).toHaveLength(5);
  });
});

describe('SupabaseGateway: escalações', () => {
  const lineup = () => {
    const l = createEmptyLineup('l1', NOW);
    l.title = 'Titular';
    l.starters[0] = { playerId: 'p1', role: 'levantador' };
    l.starters[1] = { playerId: 'p2', role: 'ponteiro' };
    l.liberoId = 'p3';
    return l;
  };

  it('grava e lê a escalação inteira (titulares por posição, líbero e reservas na ordem)', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'coach');
    const l = lineup();
    await gw.saveLineup({ ...l, benchIds: [] });
    const [saved] = (await gw.load()).lineups;
    expect(saved?.starters).toEqual(l.starters);
    expect(saved?.liberoId).toBe('p3');
  });

  it('trocar dois titulares de lugar funciona (apaga e reinsere, sem violar "ninguém duas vezes")', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'coach');
    const l = lineup();
    await gw.saveLineup(l);
    const swapped = { ...l, starters: [l.starters[1] ?? null, l.starters[0] ?? null, null, null, null, null] };
    await gw.saveLineup(swapped);
    const [saved] = (await gw.load()).lineups;
    expect(saved?.starters[0]?.playerId).toBe('p2');
    expect(saved?.starters[1]?.playerId).toBe('p1');
  });

  it('falha no meio do salvamento devolve a escalação ao estado anterior, sem deixá-la pela metade', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'coach');
    const l = lineup();
    await gw.saveLineup(l);
    // reserva que não existe: a gravação dos reservas falha DEPOIS de apagar e reinserir os titulares
    const broken = { ...l, title: 'Mudou', starters: [l.starters[1] ?? null, null, null, null, null, null], benchIds: ['fantasma'] };
    await expect(gw.saveLineup(broken)).rejects.toBeInstanceOf(IntegrityError);
    const [saved] = (await gw.load()).lineups;
    expect(saved?.title).toBe('Titular');
    expect(saved?.starters).toEqual(l.starters);
  });

  it('excluir a escalação leva titulares e reservas; analista não pode (e isso é avisado, não ignorado)', async () => {
    const { fake } = world();
    await gatewayFor(fake, 'coach').saveLineup({ ...lineup(), benchIds: [] });
    // o simulador tem uma sessão só: cada gateway é criado logo antes de ser usado
    await expect(gatewayFor(fake, 'analyst').deleteLineup('l1')).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(fake.rows('lineups', TEAM_A)).toHaveLength(1);
    await gatewayFor(fake, 'coach').deleteLineup('l1');
    expect(fake.rows('lineups', TEAM_A)).toHaveLength(0);
    expect(fake.rows('lineup_starters', TEAM_A)).toHaveLength(0);
  });
});

describe('SupabaseGateway: treinos', () => {
  it('cria treino com participantes e exercícios e preserva os ids', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'analyst');
    const t = makeTraining({ id: 't2', name: 'Treino B', participantIds: ['p2', 'p3'] });
    await gw.saveTraining(t, [makeExercise('t2', { id: 'x9', name: 'Bloqueio', focus: 'bloqueio' })]);
    const ws = await gw.load();
    const saved = ws.trainings.find((x) => x.id === 't2');
    expect([...(saved?.participantIds ?? [])].sort()).toEqual(['p2', 'p3']);
    expect(ws.exercises.filter((e) => e.trainingId === 't2').map((e) => e.id)).toEqual(['x9']);
  });

  it('editar o treino preserva os registros e troca só o que não tem registro', async () => {
    const { fake, training, ex1 } = world();
    const gw = gatewayFor(fake, 'coach');
    const edited = { ...training, name: 'Treino A (editado)', participantIds: ['p1', 'p2', 'p3'] };
    await gw.saveTraining(edited, [ex1, makeExercise('t1', { id: 'x3', name: 'Defesa', order: 1 })]);
    const ws = await gw.load();
    expect(ws.trainings[0]?.name).toBe('Treino A (editado)');
    expect(ws.exercises.map((e) => e.id).sort()).toEqual(['x1', 'x3']); // x2 não tinha registro: removido
    expect(ws.trainingEvents.map((e) => e.id)).toEqual(['e1']);
  });

  it('não remove exercício com registros nem participante com registro válido, e nada é gravado', async () => {
    const { fake, training, ex2 } = world();
    const gw = gatewayFor(fake, 'coach');
    const before = snapshotDb(fake);
    await expect(gw.saveTraining(training, [ex2])).rejects.toThrow(/exercício que tem registros/); // x1 tem o evento e1
    await expect(gw.saveTraining({ ...training, participantIds: ['p2'] }, [makeExercise('t1', { id: 'x1' }), ex2])).rejects.toThrow(/atleta que tem registros válidos/);
    expect(fake.db).toEqual(before);
  });

  it('participante cujo único registro foi desfeito pode sair da lista', async () => {
    const { fake, training, ex1, ex2 } = world();
    const gw = gatewayFor(fake, 'coach');
    await gw.voidTrainingEvent('e1', '2026-10-02T10:00:00.000Z');
    await gw.saveTraining({ ...training, participantIds: ['p2'] }, [ex1, ex2]);
    expect([...((await gw.load()).trainings[0]?.participantIds ?? [])]).toEqual(['p2']);
  });

  it('exercício de outro treino é recusado', async () => {
    const { fake, training } = world();
    await expect(gatewayFor(fake, 'coach').saveTraining(training, [makeExercise('outro-treino')])).rejects.toThrow(/outro treino/);
  });

  it('excluir o treino leva exercícios, participantes e registros; analista não exclui', async () => {
    const { fake } = world();
    await expect(gatewayFor(fake, 'analyst').deleteTraining('t1')).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(fake.rows('trainings', TEAM_A)).toHaveLength(1);
    await gatewayFor(fake, 'coach').deleteTraining('t1');
    for (const table of ['trainings', 'training_exercises', 'training_participants', 'training_events']) expect(fake.rows(table, TEAM_A)).toHaveLength(0);
    expect(fake.rows('players', TEAM_A)).toHaveLength(3); // atletas e avaliações não são tocados
    expect(fake.rows('evaluations', TEAM_A)).toHaveLength(2);
  });

  it('excluir treino que não existe não quebra nada', async () => {
    const { fake } = world();
    await expect(gatewayFor(fake, 'coach').deleteTraining('nada')).resolves.toBeUndefined();
  });
});

describe('SupabaseGateway: registros de treino', () => {
  it('é idempotente: repetir o mesmo envio (mesma attemptKey) não duplica e não dá erro', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'analyst');
    const again = { ...makeEvent('t1', 'x1', 'p2', 'recepcao', 'A', { id: 'e2', attemptKey: 'k2' }) };
    await gw.addTrainingEvent(again);
    await gw.addTrainingEvent(again);
    await gw.addTrainingEvent({ ...again, id: 'e2-retry' }); // outra tentativa de rede com o mesmo toque
    expect(fake.rows('training_events', TEAM_A).filter((r) => r.attempt_key === 'k2')).toHaveLength(1);
    expect((await gw.load()).trainingEvents.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('a chave de um registro desfeito continua ocupada: o mesmo toque não ressuscita', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'analyst');
    await gw.voidTrainingEvent('e1', '2026-10-02T10:00:00.000Z');
    await gw.addTrainingEvent(makeEvent('t1', 'x1', 'p1', 'saque', 'ace', { id: 'e1-novo', attemptKey: 'k1' }));
    const events = (await gw.load()).trainingEvents;
    expect(events).toHaveLength(1);
    expect(events[0]?.voidedAt).not.toBeNull();
  });

  it('recusa registro de exercício de outro treino, de atleta fora do treino e de treino inexistente', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'coach');
    fake.seed('trainings', [{ team_id: TEAM_A, id: 't9', name: 'Outro', held_on: '2026-10-02', status: 'aberto', completed_at: null, created_at: NOW, updated_at: NOW, demo: false, description: '', notes: '', responsible: '', duration_minutes: null }]);
    fake.seed('training_exercises', [{ team_id: TEAM_A, id: 'x-outro', training_id: 't9', name: 'Outro ex', focus: null, sort_order: 0, created_at: NOW }]);
    await expect(gw.addTrainingEvent(makeEvent('t1', 'x-outro', 'p1', 'saque', 'ace'))).rejects.toThrow(/não pertence ao treino/);
    await expect(gw.addTrainingEvent(makeEvent('t1', 'x1', 'p3', 'saque', 'ace'))).rejects.toThrow(/não participa do treino/);
    await expect(gw.addTrainingEvent(makeEvent('nao-existe', 'x1', 'p1', 'saque', 'ace'))).rejects.toBeInstanceOf(IntegrityError);
    expect(fake.rows('training_events', TEAM_A)).toHaveLength(1);
  });

  it('desfazer anula sem apagar, registra quem anulou e repetir é inofensivo', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'analyst');
    await gw.voidTrainingEvent('e1', '2026-10-02T10:00:00.000Z');
    const row = fake.rows('training_events', TEAM_A)[0];
    expect(row).toMatchObject({ voided_at: '2026-10-02T10:00:00.000Z', voided_by: USERS.analyst.id });
    await expect(gw.voidTrainingEvent('e1', '2026-12-31T00:00:00.000Z')).resolves.toBeUndefined();
    expect(fake.rows('training_events', TEAM_A)[0]?.voided_at).toBe('2026-10-02T10:00:00.000Z'); // a primeira anulação vale
    expect(fake.rows('training_events', TEAM_A)).toHaveLength(1); // nada foi apagado
  });

  it('desfazer um registro que não existe é recusado', async () => {
    const { fake } = world();
    await expect(gatewayFor(fake, 'coach').voidTrainingEvent('nada', NOW)).rejects.toThrow(/não existe/);
  });

  it('leitor não registra nem desfaz: o banco recusa e o gateway avisa em vez de fingir sucesso', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'viewer');
    await expect(gw.addTrainingEvent(makeEvent('t1', 'x1', 'p2', 'saque', 'ace', { id: 'e7', attemptKey: 'k7' }))).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(gw.voidTrainingEvent('e1', NOW)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(gw.savePlayer(makePlayer({ id: 'p8', jerseyNumber: 8 }))).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(fake.rows('training_events', TEAM_A)[0]?.voided_at ?? null).toBeNull();
    expect(fake.rows('training_events', TEAM_A)).toHaveLength(1);
  });
});

describe('SupabaseGateway: falhas de conexão e de sessão', () => {
  it('sem conexão, leitura e gravações falham de forma explícita e nada muda', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'coach');
    const before = snapshotDb(fake);
    fake.offline = true;
    await expect(gw.load()).rejects.toBeInstanceOf(RemoteUnavailableError);
    await expect(gw.savePlayer(makePlayer({ id: 'p8', jerseyNumber: 8 }))).rejects.toBeInstanceOf(RemoteUnavailableError);
    await expect(gw.addTrainingEvent(makeEvent('t1', 'x1', 'p1', 'saque', 'erro'))).rejects.toBeInstanceOf(RemoteUnavailableError);
    fake.offline = false;
    expect(fake.db).toEqual(before);
  });

  it('sessão expirada vira SessionExpiredError, sem gravar', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'coach');
    const before = snapshotDb(fake);
    fake.expired = true;
    await expect(gw.load()).rejects.toBeInstanceOf(SessionExpiredError);
    await expect(gw.addEvaluation(makeEvaluation('p1', '2026-10-05'))).rejects.toBeInstanceOf(SessionExpiredError);
    fake.expired = false;
    expect(fake.db).toEqual(before);
  });

  it('mapRemoteError traduz os códigos do banco', () => {
    expect(mapRemoteError({ code: '42501', message: 'x' })).toBeInstanceOf(PermissionDeniedError);
    expect(mapRemoteError({ code: '', message: 'x' }, 403)).toBeInstanceOf(PermissionDeniedError);
    expect(mapRemoteError({ code: 'PGRST301', message: 'JWT expired' })).toBeInstanceOf(SessionExpiredError);
    expect(mapRemoteError({ message: 'x' }, 401)).toBeInstanceOf(SessionExpiredError);
    expect(mapRemoteError({ code: '', message: 'TypeError: Failed to fetch' })).toBeInstanceOf(RemoteUnavailableError);
    expect(mapRemoteError({ code: '23505', message: 'duplicate key value violates unique constraint "players_team_id_jersey_number_key"' })).toBeInstanceOf(IntegrityError);
    expect(mapRemoteError({ code: '23503', message: 'x' })).toBeInstanceOf(IntegrityError);
    expect(mapRemoteError({ code: 'XX000', message: 'boom' })).toBeInstanceOf(RemoteDataError);
    // a mensagem técnica do banco não vaza para a pessoa
    expect(mapRemoteError({ code: 'XX000', message: 'relation secret_table does not exist' }).message).not.toMatch(/secret_table/);
  });
});

describe('SupabaseGateway: o que não existe com dados na nuvem', () => {
  it('substituir o workspace, desfazer e cópia bruta não existem, e dizem isso sem alterar nada', async () => {
    const { fake } = world();
    const gw = gatewayFor(fake, 'coach');
    const before = snapshotDb(fake);
    expect(gw.kind).toBe('remote');
    await expect(gw.replaceWorkspace()).rejects.toBeInstanceOf(RemoteOperationUnavailableError);
    await expect(gw.restoreSnapshot()).rejects.toBeInstanceOf(RemoteOperationUnavailableError);
    expect(await gw.snapshotInfo()).toBeNull();
    expect(await gw.exportRaw()).toBeNull();
    expect(await gw.recoveryCopies()).toEqual([]);
    expect(await gw.usage()).toBeNull();
    expect(fake.db).toEqual(before);
  });

  it('exige equipe e pessoa', () => {
    const fake = newFake();
    expect(() => new (gatewayFor(fake, 'coach').constructor as new (o: unknown) => unknown)({ client: fake.client, teamId: '', userId: 'u' })).toThrow(/equipe/);
  });
});

describe('SupabaseGateway: equipes e dados locais não se misturam', () => {
  it('cada gateway só enxerga e altera a própria equipe', async () => {
    const { fake } = world();
    seedTeam(fake, TEAM_B, 'Equipe B', { coach: 'coach' });
    seedWorkspace(fake, TEAM_B, { players: [makePlayer({ id: 'pb', jerseyNumber: 1 })] }); // camisa 1 repete em outra equipe: permitido
    const a = gatewayFor(fake, 'coach', TEAM_A);
    const b = gatewayFor(fake, 'coach', TEAM_B);
    await b.savePlayer(makePlayer({ id: 'pb2', jerseyNumber: 2 }));
    expect((await a.load()).players.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
    expect((await b.load()).players.map((p) => p.id).sort()).toEqual(['pb', 'pb2']);
  });

  it('não lê nem escreve no armazenamento local do navegador', async () => {
    const { fake } = world();
    window.localStorage.setItem('alpha7.workspace.v1', 'DADOS-LOCAIS-INTACTOS');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const gw = gatewayFor(fake, 'coach');
    await gw.load();
    await gw.savePlayer(makePlayer({ id: 'p8', jerseyNumber: 8 }));
    await gw.saveSettings({ weights: DEFAULT_OVERALL_WEIGHTS });
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(window.localStorage.getItem('alpha7.workspace.v1')).toBe('DADOS-LOCAIS-INTACTOS');
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('o workspace remoto vazio nunca vira demonstração', async () => {
    const fake = newFake();
    seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach' });
    const ws = await gatewayFor(fake, 'coach').load();
    expect(JSON.stringify(ws)).not.toContain('"demo":true');
    expect(ws).toEqual({ ...createEmptyWorkspace(), settings: { weights: DEFAULT_OVERALL_WEIGHTS } });
  });
});
