import { createBackup, parseBackup, summarizeWorkspace, validateWorkspace, workspaceFingerprint } from './backup';
import { createEmptyWorkspace } from './demo';
import { concludeMatchOp, recordRallyOp, startSetOp } from './matchOps';
import type { Workspace } from './types';
import { sha256Hex } from './sha256';
import { canonicalize } from './backup';
import type { RallyInput } from '@/domain/match';
import { makeMatch, makePlayer, makeStarters } from '@/test/factories';

const NOW = '2026-10-01T10:00:00.000Z';
const players = [1, 2, 3, 4, 5, 6, 7].map((n) => makePlayer({ id: `bp${n}`, name: `Atleta ${n}`, jerseyNumber: n + 40 }));
const ids = players.map((p) => p.id);

let n = 0;
const input = (seq: number, winner: 'us' | 'them', extra: Partial<RallyInput> = {}): RallyInput => {
  n += 1;
  return { id: `br-${n}`, attemptKey: `bk-${n}`, setNumber: 1, expectedSeq: seq, winner, reason: null, playerId: null, recordedAt: NOW, actions: [], ...extra };
};

/** Partida real concluída: 1 set a 0 (formato de 1 set até 3), com motivo, atleta e ação técnica. */
function workspaceWithMatch(): Workspace {
  const ws: Workspace = { ...createEmptyWorkspace(), players: structuredClone(players), matches: [makeMatch({ id: 'bm1', opponent: 'Rivais', format: { bestOf: 1, setPoints: 3, decidingSetPoints: 3, minLead: 2 } })] };
  startSetOp(ws, 'bm1', { number: 1, firstServer: 'us', starters: makeStarters(ids), liberoId: 'bp7', createdAt: NOW }, NOW);
  recordRallyOp(ws, 'bm1', input(1, 'us', { reason: 'ace', playerId: 'bp1', actions: [{ id: 'bact1', attemptKey: 'bak1', playerId: 'bp1', fundamental: 'saque', outcome: 'ace' }] }));
  recordRallyOp(ws, 'bm1', input(2, 'them'));
  recordRallyOp(ws, 'bm1', input(3, 'us'));
  recordRallyOp(ws, 'bm1', input(4, 'us'));
  concludeMatchOp(ws, 'bm1', NOW);
  return ws;
}

const roundTrip = (ws: Workspace) => {
  const made = createBackup(ws, { appVersion: '0.5.0', now: new Date('2026-10-13T12:00:00Z') });
  if (!made.ok) throw new Error(`backup recusado: ${made.errors.join('; ')}`);
  return { made, parsed: parseBackup(made.json) };
};

describe('backup com partidas', () => {
  it('ida e volta: partida, set, pontos (inclusive anulados) e ações voltam idênticos', () => {
    const ws = workspaceWithMatch();
    const { made, parsed } = roundTrip(ws);
    expect(made.summary).toMatchObject({ matches: 1, rallies: 4, rallyActions: 1 });
    if (!parsed.ok) throw new Error(parsed.errors.join('; '));
    expect(parsed.workspace.matches).toEqual(ws.matches);
    expect(parsed.workspace.matchSets).toEqual(ws.matchSets);
    expect(parsed.workspace.rallies).toEqual(ws.rallies);
    expect(parsed.workspace.rallyActions).toEqual(ws.rallyActions);
    expect(parsed.summary.realRecords).toBeGreaterThan(0);
  });

  it('um ponto desfeito é preservado e não entra nas contagens', () => {
    const ws = workspaceWithMatch();
    // Reabre o cenário: desfaz o último ponto (o set volta a estar em andamento) e guarda a partida como em andamento.
    const last = ws.rallies[ws.rallies.length - 1]!;
    ws.rallies = ws.rallies.map((r) => (r.id === last.id ? { ...r, voidedAt: NOW } : r));
    ws.matches = ws.matches.map((m) => ({ ...m, status: 'em_andamento', finalSetsUs: null, finalSetsThem: null, concludedAt: null }));
    const { made, parsed } = roundTrip(ws);
    expect(made.summary).toMatchObject({ rallies: 3 }); // 4 gravados, 1 anulado
    expect(parsed.ok && parsed.workspace.rallies).toHaveLength(4);
  });

  it('sem partidas, o corpo do backup NÃO ganha chaves novas (checksum e impressão digital anteriores seguem iguais)', () => {
    const ws = { ...createEmptyWorkspace(), players: structuredClone(players) };
    const { made } = roundTrip(ws);
    expect(Object.keys(made.file.workspace).sort()).toEqual(['activity', 'evaluations', 'exercises', 'lineups', 'players', 'settings', 'trainingEvents', 'trainings'].sort());
    expect(workspaceFingerprint(ws)).toBe(sha256Hex(canonicalize(made.file.workspace)));
  });

  it('um backup antigo (sem coleções de partida) continua restaurável e abre com listas vazias', () => {
    const ws = { ...createEmptyWorkspace(), players: structuredClone(players) };
    const { made } = roundTrip(ws);
    const old = JSON.parse(made.json) as { workspace: Record<string, unknown> };
    expect('matches' in old.workspace).toBe(false);
    const parsed = parseBackup(made.json);
    expect(parsed.ok && parsed.workspace.matches).toEqual([]);
    expect(parsed.ok && parsed.workspace.rallies).toEqual([]);
  });

  describe('arquivo adulterado é rejeitado por inteiro', () => {
    const tamper = (change: (body: Record<string, unknown[]>) => void): string[] => {
      const ws = workspaceWithMatch();
      const body = JSON.parse(JSON.stringify(ws)) as Record<string, unknown[]>;
      change(body);
      const checked = validateWorkspace(body);
      return checked.ok ? [] : checked.errors;
    };

    it('rotação ou sacador que não seguem o rodízio', () => {
      const errors = tamper((b) => ((b.rallies?.[2] as { rotation: number }).rotation = 3));
      expect(errors.some((e) => /rodízio/.test(e))).toBe(true);
    });

    it('numeração de pontos com buraco', () => {
      const errors = tamper((b) => ((b.rallies?.[3] as { seq: number }).seq = 9));
      expect(errors.some((e) => /sequencial/.test(e))).toBe(true);
    });

    it('chave de tentativa repetida (ponto duplicado)', () => {
      const errors = tamper((b) => ((b.rallies?.[1] as { attemptKey: string }).attemptKey = (b.rallies?.[0] as { attemptKey: string }).attemptKey));
      expect(errors.some((e) => /duplicado|repetida/.test(e))).toBe(true);
    });

    it('ponto registrado depois de o set estar encerrado', () => {
      const errors = tamper((b) => {
        const extra = { ...(b.rallies?.[0] as object), id: 'extra', attemptKey: 'extra-key', seq: 5, reason: null, playerId: null };
        b.rallies?.push(extra);
      });
      expect(errors.some((e) => /depois de o set estar encerrado/.test(e))).toBe(true);
    });

    it('resultado final que não confere com os sets', () => {
      const errors = tamper((b) => ((b.matches?.[0] as { finalSetsUs: number }).finalSetsUs = 0));
      expect(errors.some((e) => /não confere/.test(e))).toBe(true);
    });

    it('partida concluída sem resultado, formato inválido, atleta e vínculos inexistentes, motivo incoerente', () => {
      expect(tamper((b) => ((b.matches?.[0] as { concludedAt: null }).concludedAt = null)).length).toBeGreaterThan(0);
      expect(tamper((b) => ((b.matches?.[0] as { format: { bestOf: number } }).format.bestOf = 4)).length).toBeGreaterThan(0);
      expect(tamper((b) => ((b.matchSets?.[0] as { matchId: string }).matchId = 'fantasma')).length).toBeGreaterThan(0);
      expect(tamper((b) => ((b.rallies?.[0] as { playerId: string }).playerId = 'fantasma')).length).toBeGreaterThan(0);
      expect(tamper((b) => ((b.rallyActions?.[0] as { rallyId: string }).rallyId = 'fantasma')).length).toBeGreaterThan(0);
      expect(tamper((b) => ((b.rallyActions?.[0] as { outcome: string }).outcome = 'A')).length).toBeGreaterThan(0); // recepção não é saque
      expect(tamper((b) => ((b.rallies?.[1] as { reason: string }).reason = 'ace')).some((e) => /Ace só vale/.test(e))).toBe(true); // o adversário não sacava
      expect(tamper((b) => (((b.matchSets?.[0] as { starters: { playerId: string }[] }).starters[1]!).playerId = 'bp1')).length).toBeGreaterThan(0); // atleta repetido
    });
  });

  it('o resumo conta partidas, pontos válidos e ações válidas; partida é dado real, nunca demonstração', () => {
    const summary = summarizeWorkspace(workspaceWithMatch());
    expect(summary).toMatchObject({ matches: 1, rallies: 4, rallyActions: 1 });
    expect(summary.realRecords).toBeGreaterThanOrEqual(1 + players.length);
  });
});
