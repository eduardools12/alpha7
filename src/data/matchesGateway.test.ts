/**
 * Contrato de partidas, igual para o gateway LOCAL e para o REMOTO (contra o cliente simulado). As regras de
 * pontuação, saque e rotação vêm de domain/match.ts (testado em src/domain/match.test.ts); o SQL real do banco é provado
 * em supabase/tests/matches.test.sql. Aqui se prova que os dois gateways se comportam do mesmo jeito para o aplicativo.
 */
import { createEmptyWorkspace } from './demo';
import { ConflictError, IntegrityError, PermissionDeniedError, type DataGateway } from './gateway';
import { LocalStorageGateway } from './localStorageGateway';
import type { Workspace } from './types';
import { activeRallies, type RallyInput } from '@/domain/match';
import { makeMatch, makeMatchSet, makePlayer, makeStarters } from '@/test/factories';
import { createMemoryStorage } from '@/test/renderApp';
import { TEAM_A, gatewayFor, newFake, seedTeam, seedWorkspace } from '@/test/remoteFixtures';

const NOW = '2026-10-01T10:00:00.000Z';
const PLAYERS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'].map((id, i) =>
  makePlayer({ id, name: `Atleta ${id}`, jerseyNumber: i + 1, primaryPosition: id === 'p7' ? 'libero' : 'ponteiro' }),
);
const STARTERS = makeStarters(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
const MATCH = makeMatch({ id: 'm1', opponent: 'Rivais', format: { bestOf: 3, setPoints: 5, decidingSetPoints: 3, minLead: 2 } });

let keyCounter = 0;
const rally = (seq: number, winner: 'us' | 'them', extra: Partial<RallyInput> = {}): RallyInput => {
  keyCounter += 1;
  return { id: `r-${keyCounter}`, attemptKey: `k-${keyCounter}`, setNumber: 1, expectedSeq: seq, winner, reason: null, playerId: null, recordedAt: NOW, actions: [], ...extra };
};

interface World {
  gateway: DataGateway;
  load(): Promise<Workspace>;
}

const backends: [string, (who?: 'coach' | 'analyst' | 'viewer') => Promise<World>][] = [
  [
    'local',
    async () => {
      const gateway = new LocalStorageGateway(createMemoryStorage());
      await gateway.replaceWorkspace({ ...createEmptyWorkspace(), players: PLAYERS }, 'teste');
      return { gateway, load: () => gateway.load() };
    },
  ],
  [
    'remoto (cliente simulado)',
    async (who = 'coach') => {
      const fake = newFake();
      seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach', analyst: 'analyst', viewer: 'viewer' });
      seedWorkspace(fake, TEAM_A, { players: PLAYERS });
      const gateway = gatewayFor(fake, who);
      return { gateway, load: () => gateway.load() };
    },
  ],
];

describe.each(backends)('partidas no gateway %s', (_name, build) => {
  async function started() {
    const { gateway, load } = await build();
    await gateway.saveMatch(MATCH);
    await gateway.startSet('m1', { number: 1, firstServer: 'us', starters: STARTERS, liberoId: 'p7', createdAt: NOW });
    return { gateway, load };
  }

  it('cria a partida como agendada e a edição não toca no status nem no resultado', async () => {
    const { gateway, load } = await build();
    const created = await gateway.saveMatch({ ...MATCH, status: 'concluida', finalSetsUs: 3, finalSetsThem: 0, concludedAt: NOW });
    expect(created.status).toBe('agendada'); // o chamador não escolhe status
    expect(created.finalSetsUs).toBeNull();
    const edited = await gateway.saveMatch({ ...created, opponent: 'Rivais FC', venue: 'Ginásio', updatedAt: '2026-10-02T10:00:00.000Z' });
    expect(edited).toMatchObject({ opponent: 'Rivais FC', venue: 'Ginásio', status: 'agendada' });
    expect((await load()).matches).toHaveLength(1);
  });

  it('inicia o set, calcula saque e rotação e registra o motivo e o atleta', async () => {
    const { gateway, load } = await started();
    const first = await gateway.recordRally('m1', rally(1, 'us', { reason: 'ace', playerId: 'p1' }));
    expect(first.rally).toMatchObject({ seq: 1, servingSide: 'us', rotation: 0, serverPlayerId: 'p1', reason: 'ace', playerId: 'p1' });
    await gateway.recordRally('m1', rally(2, 'them'));
    const sideOut = await gateway.recordRally('m1', rally(3, 'us')); // o adversário sacava: o Alpha7 conquista o saque
    expect(sideOut.rally).toMatchObject({ seq: 3, servingSide: 'them', rotation: 0, serverPlayerId: null });
    const next = await gateway.recordRally('m1', rally(4, 'us'));
    expect(next.rally).toMatchObject({ servingSide: 'us', rotation: 1, serverPlayerId: 'p2' });
    const ws = await load();
    expect(ws.matches[0]?.status).toBe('em_andamento');
    expect(ws.matchSets[0]).toMatchObject({ number: 1, firstServer: 'us', liberoId: 'p7' });
    expect(ws.matchSets[0]?.starters.map((s) => s.playerId)).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(ws.rallies.map((r) => r.seq)).toEqual([1, 2, 3, 4]);
  });

  it('é idempotente: o mesmo envio devolve o ponto original e nunca duplica', async () => {
    const { gateway, load } = await started();
    const input = rally(1, 'us', { reason: 'ataque', actions: [{ id: 'ra-1', attemptKey: 'ka-1', playerId: 'p3', fundamental: 'ataque', outcome: 'ponto' }] });
    const a = await gateway.recordRally('m1', input);
    const b = await gateway.recordRally('m1', { ...input, id: 'outro-id' });
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(b.rally.id).toBe(a.rally.id);
    const ws = await load();
    expect(ws.rallies).toHaveLength(1);
    expect(ws.rallyActions).toHaveLength(1);
  });

  it('recusa tela atrasada (ConflictError) sem gravar nada', async () => {
    const { gateway, load } = await started();
    await gateway.recordRally('m1', rally(1, 'us'));
    await expect(gateway.recordRally('m1', rally(1, 'them'))).rejects.toBeInstanceOf(ConflictError);
    expect(activeRallies((await load()).rallies)).toHaveLength(1);
    await expect(gateway.startSet('m1', { number: 2, firstServer: 'us', starters: STARTERS, liberoId: null, createdAt: NOW })).rejects.toBeInstanceOf(ConflictError);
  });

  it('recusa motivo incoerente e atleta inexistente, e uma ação inválida derruba o ponto inteiro', async () => {
    const { gateway, load } = await started();
    await expect(gateway.recordRally('m1', rally(1, 'them', { reason: 'ace' }))).rejects.toBeInstanceOf(IntegrityError); // ace de quem não sacava
    await expect(gateway.recordRally('m1', rally(1, 'us', { playerId: 'fantasma' }))).rejects.toBeInstanceOf(IntegrityError);
    await expect(
      gateway.recordRally('m1', rally(1, 'us', { actions: [{ id: 'a', attemptKey: 'ka', playerId: 'p1', fundamental: 'saque', outcome: 'A' }] })),
    ).rejects.toBeInstanceOf(IntegrityError);
    expect((await load()).rallies).toHaveLength(0);
  });

  it('fecha o set só com a pontuação E a diferença mínima, e depois recusa novos pontos', async () => {
    const { gateway, load } = await started();
    let seq = 1;
    for (const winner of ['us', 'us', 'us', 'us', 'them', 'them', 'us'] as const) await gateway.recordRally('m1', rally(seq++, winner)); // 5 a 2? veja abaixo
    // 5 pontos do Alpha7 contra 2: já fechou no 5º (5 a 2, diferença 3)
    const ws = await load();
    expect(ws.rallies.filter((r) => r.winnerSide === 'us')).toHaveLength(5);
    await expect(gateway.recordRally('m1', rally(8, 'us'))).rejects.toBeInstanceOf(IntegrityError);
  });

  it('5 a 4 não fecha (falta a diferença de 2); 6 a 4 fecha', async () => {
    const { gateway, load } = await started();
    let seq = 1;
    for (const winner of ['us', 'them', 'us', 'them', 'us', 'them', 'us', 'them', 'us'] as const) await gateway.recordRally('m1', rally(seq++, winner)); // 5 a 4
    await gateway.recordRally('m1', rally(seq++, 'us')); // 6 a 4: ainda aceita o ponto anterior e fecha agora
    await expect(gateway.recordRally('m1', rally(seq, 'us'))).rejects.toBeInstanceOf(IntegrityError);
    expect(activeRallies((await load()).rallies)).toHaveLength(10);
  });

  it('desfazer anula (não apaga), libera o número e reabre o set fechado; só o último ponto', async () => {
    const { gateway, load } = await started();
    const a = await gateway.recordRally('m1', rally(1, 'us', { actions: [{ id: 'ra-u', attemptKey: 'ka-u', playerId: 'p1', fundamental: 'saque', outcome: 'ace' }] }));
    const b = await gateway.recordRally('m1', rally(2, 'us'));
    await expect(gateway.voidLastRally('m1', a.rally.id, NOW)).rejects.toBeInstanceOf(ConflictError); // não é o último
    await gateway.voidLastRally('m1', b.rally.id, NOW);
    await gateway.voidLastRally('m1', a.rally.id, NOW);
    const ws = await load();
    expect(ws.rallies).toHaveLength(2); // guardados
    expect(ws.rallies.every((r) => r.voidedAt !== null)).toBe(true);
    expect(ws.rallyActions.every((x) => x.voidedAt !== null)).toBe(true);
    await expect(gateway.voidLastRally('m1', a.rally.id, NOW)).rejects.toBeInstanceOf(IntegrityError); // nada a desfazer
    const again = await gateway.recordRally('m1', rally(1, 'them')); // o número 1 voltou a ser o próximo
    expect(again.rally.seq).toBe(1);
  });

  it('cancela só um set que nunca teve ponto (nem desfeito) e volta a partida para agendada', async () => {
    const { gateway, load } = await started();
    await gateway.cancelEmptySet('m1', 1);
    let ws = await load();
    expect(ws.matchSets).toHaveLength(0);
    expect(ws.matches[0]?.status).toBe('agendada');
    await gateway.startSet('m1', { number: 1, firstServer: 'us', starters: STARTERS, liberoId: null, createdAt: NOW });
    const r = await gateway.recordRally('m1', rally(1, 'us'));
    await gateway.voidLastRally('m1', r.rally.id, NOW);
    await expect(gateway.cancelEmptySet('m1', 1)).rejects.toBeInstanceOf(IntegrityError);
    ws = await load();
    expect(ws.matchSets).toHaveLength(1);
  });

  it('o formato trava depois do primeiro set; o resto continua editável', async () => {
    const { gateway } = await started();
    await expect(gateway.saveMatch({ ...MATCH, format: { ...MATCH.format, bestOf: 5 }, updatedAt: NOW })).rejects.toBeInstanceOf(IntegrityError);
    await expect(gateway.saveMatch({ ...MATCH, venue: 'Novo local', updatedAt: NOW })).resolves.toMatchObject({ venue: 'Novo local' });
  });

  it('encerra com o resultado dos sets fechados, bloqueia registros e só reabre pela função de reabrir', async () => {
    const { gateway, load } = await started();
    let seq = 1;
    for (const winner of ['us', 'us', 'us', 'us', 'us'] as const) await gateway.recordRally('m1', rally(seq++, winner)); // set 1: 5 a 0
    await gateway.startSet('m1', { number: 2, firstServer: 'them', starters: STARTERS, liberoId: null, createdAt: NOW });
    await gateway.recordRally('m1', rally(1, 'them', { setNumber: 2 })); // set 2 em andamento: não conta
    const done = await gateway.concludeMatch('m1', NOW);
    expect(done).toMatchObject({ status: 'concluida', finalSetsUs: 1, finalSetsThem: 0 });
    await expect(gateway.recordRally('m1', rally(2, 'us', { setNumber: 2 }))).rejects.toBeInstanceOf(IntegrityError);
    await expect(gateway.concludeMatch('m1', NOW)).rejects.toBeInstanceOf(IntegrityError);
    const reopened = await gateway.reopenMatch('m1');
    expect(reopened).toMatchObject({ status: 'em_andamento', finalSetsUs: null, finalSetsThem: null, concludedAt: null });
    expect((await load()).matches[0]?.status).toBe('em_andamento');
  });

  it('ações técnicas avulsas: idempotentes, só em ponto ativo e desfeitas sem apagar', async () => {
    const { gateway, load } = await started();
    const r = await gateway.recordRally('m1', rally(1, 'us'));
    const input = { id: 'ra-1', attemptKey: 'ka-1', rallyId: r.rally.id, playerId: 'p2', fundamental: 'ataque' as const, outcome: 'ponto', recordedAt: NOW };
    await gateway.addRallyAction(input);
    await gateway.addRallyAction({ ...input, id: 'ra-2' }); // mesmo toque
    await expect(gateway.addRallyAction({ ...input, id: 'ra-3', attemptKey: 'ka-3', outcome: 'A' })).rejects.toBeInstanceOf(IntegrityError);
    await expect(gateway.addRallyAction({ ...input, id: 'ra-4', attemptKey: 'ka-4', rallyId: 'nao-existe' })).rejects.toBeInstanceOf(IntegrityError);
    expect((await load()).rallyActions).toHaveLength(1);
    await gateway.voidRallyAction('ra-1', NOW);
    const ws = await load();
    expect(ws.rallyActions).toHaveLength(1);
    expect(ws.rallyActions[0]?.voidedAt).not.toBeNull();
    await gateway.voidRallyAction('ra-1', NOW); // repetir é inofensivo
  });

  it('excluir a partida leva só o que é dela (sets, pontos e ações)', async () => {
    const { gateway, load } = await started();
    const r = await gateway.recordRally('m1', rally(1, 'us', { actions: [{ id: 'a', attemptKey: 'ka', playerId: 'p1', fundamental: 'saque', outcome: 'ace' }] }));
    expect(r.actions).toHaveLength(1);
    await gateway.saveMatch(makeMatch({ id: 'm2', opponent: 'Outro' }));
    await gateway.deleteMatch('m1');
    const ws = await load();
    expect(ws.matches.map((m) => m.id)).toEqual(['m2']);
    expect(ws.matchSets).toHaveLength(0);
    expect(ws.rallies).toHaveLength(0);
    expect(ws.rallyActions).toHaveLength(0);
  });
});

describe('partidas e papéis (cliente simulado: não é prova da RLS)', () => {
  /** Uma base com a partida e um set em andamento, para entrar com cada papel sobre os MESMOS dados. */
  function shared() {
    const fake = newFake();
    seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach', analyst: 'analyst', viewer: 'viewer' });
    seedWorkspace(fake, TEAM_A, { players: PLAYERS, matches: [{ ...MATCH, status: 'em_andamento' }], matchSets: [makeMatchSet('m1', 1, ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'])] });
    return fake;
  }

  it('viewer lê, mas toda escrita de partida é recusada', async () => {
    const viewer = gatewayFor(shared(), 'viewer');
    expect((await viewer.load()).matches).toHaveLength(1);
    await expect(viewer.saveMatch(makeMatch({ id: 'mv' }))).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(viewer.saveMatch({ ...MATCH, venue: 'x', updatedAt: NOW })).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(viewer.startSet('m1', { number: 2, firstServer: 'us', starters: STARTERS, liberoId: null, createdAt: NOW })).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(viewer.recordRally('m1', rally(1, 'us'))).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(viewer.voidLastRally('m1', 'x', NOW)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(viewer.cancelEmptySet('m1', 1)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(viewer.concludeMatch('m1', NOW)).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(viewer.reopenMatch('m1')).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(viewer.deleteMatch('m1')).rejects.toBeInstanceOf(PermissionDeniedError);
    expect((await viewer.load()).rallies).toHaveLength(0);
  });

  it('analyst registra, mas não reabre nem exclui partida', async () => {
    const fake = shared();
    const analyst = gatewayFor(fake, 'analyst');
    for (const [index, winner] of (['us', 'us', 'us', 'us', 'us'] as const).entries()) await analyst.recordRally('m1', rally(index + 1, winner));
    await analyst.concludeMatch('m1', NOW);
    await expect(analyst.reopenMatch('m1')).rejects.toBeInstanceOf(PermissionDeniedError);
    await expect(analyst.deleteMatch('m1')).rejects.toBeInstanceOf(PermissionDeniedError);
    expect((await analyst.load()).matches[0]?.status).toBe('concluida');
    const coach = gatewayFor(fake, 'coach');
    await expect(coach.reopenMatch('m1')).resolves.toMatchObject({ status: 'em_andamento' });
    await coach.deleteMatch('m1');
    expect((await coach.load()).matches).toHaveLength(0);
  });

  it('o banco simulado recusa gravar sets, pontos e ações direto nas tabelas, até para a comissão técnica', async () => {
    const fake = shared();
    const client = fake.client;
    gatewayFor(fake, 'coach');
    const set = await client.from('match_sets').insert({ team_id: TEAM_A, match_id: 'm1', number: 2, first_server: 'us', created_at: NOW });
    const direct = await client.from('rallies').insert({ team_id: TEAM_A, id: 'x', match_id: 'm1', set_number: 1, seq: 1, serving_side: 'us', winner_side: 'us', rotation: 0, attempt_key: 'k', recorded_at: NOW });
    const status = await client.from('matches').update({ status: 'concluida' }).eq('team_id', TEAM_A).eq('id', 'm1');
    expect([set.error?.code, direct.error?.code, status.error?.code]).toEqual(['42501', '42501', '42501']);
  });
});
