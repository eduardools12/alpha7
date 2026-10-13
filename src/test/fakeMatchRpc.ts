/**
 * Funções de partida do banco SIMULADAS (start_set, record_rally...). Aplicam as mesmas regras puras de
 * domain/match.ts sobre as linhas da base simulada, então testam o CÓDIGO DO APLICATIVO (gateway, tradução de erros,
 * telas), não o SQL: as funções SQL reais são provadas em supabase/tests/matches.test.sql, no PostgreSQL de verdade.
 */
import { ConflictError, IntegrityError } from '@/data/gateway';
import {
  addRallyActionOp,
  cancelEmptySetOp,
  concludeMatchOp,
  recordRallyOp,
  reopenMatchOp,
  startSetOp,
  voidLastRallyOp,
  voidRallyActionOp,
} from '@/data/matchOps';
import {
  matchFromRow,
  playerFromRow,
  rallyActionFromRow,
  rallyFromRow,
  setFromRows,
  type MatchRow,
  type RallyActionRow,
  type RallyRow,
  type SetRow,
  type SetStarterRow,
} from '@/data/supabase/mappers';
import type { Workspace } from '@/data/types';
import { createEmptyWorkspace } from '@/data/demo';
import type { Match, MatchSet, Rally, RallyAction } from '@/domain/match';
import type { Role } from '@/auth/permissions';

type Row = Record<string, unknown>;
type Db = Record<string, Row[]>;

export interface RpcResult {
  data: unknown;
  error: { code: string; message: string; details: string; hint: string } | null;
  status: number;
}

const err = (code: string, message: string, status = 400): RpcResult => ({ data: null, error: { code, message, details: '', hint: '' }, status });

/* ───────── domínio → linhas do esquema ───────── */

export const matchRow = (teamId: string, m: Match): Row => ({
  team_id: teamId,
  id: m.id,
  opponent: m.opponent,
  competition: m.competition,
  scheduled_at: m.scheduledAt,
  venue: m.venue,
  lineup_id: m.lineupId,
  best_of: m.format.bestOf,
  set_points: m.format.setPoints,
  deciding_set_points: m.format.decidingSetPoints,
  min_lead: m.format.minLead,
  status: m.status,
  final_sets_us: m.finalSetsUs,
  final_sets_them: m.finalSetsThem,
  concluded_at: m.concludedAt,
  created_at: m.createdAt,
  updated_at: m.updatedAt,
});

export const setRows = (teamId: string, s: MatchSet): { set: Row; starters: Row[] } => ({
  set: { team_id: teamId, match_id: s.matchId, number: s.number, first_server: s.firstServer, libero_id: s.liberoId, created_at: s.createdAt },
  starters: s.starters.map((st) => ({ team_id: teamId, match_id: s.matchId, set_number: s.number, slot: st.slot, player_id: st.playerId, role: st.role })),
});

export const rallyRow = (teamId: string, r: Rally): Row => ({
  team_id: teamId,
  id: r.id,
  match_id: r.matchId,
  set_number: r.setNumber,
  seq: r.seq,
  serving_side: r.servingSide,
  winner_side: r.winnerSide,
  rotation: r.rotation,
  server_player_id: r.serverPlayerId,
  reason: r.reason,
  player_id: r.playerId,
  attempt_key: r.attemptKey,
  recorded_at: r.recordedAt,
  voided_at: r.voidedAt,
  voided_by: null,
});

export const actionRow = (teamId: string, a: RallyAction): Row => ({
  team_id: teamId,
  id: a.id,
  match_id: a.matchId,
  rally_id: a.rallyId,
  player_id: a.playerId,
  fundamental: a.fundamental,
  outcome: a.outcome,
  attempt_key: a.attemptKey,
  recorded_at: a.recordedAt,
  voided_at: a.voidedAt,
  voided_by: null,
});

/** Todas as linhas de partida de um workspace, para semear a base simulada. */
export function matchTableRows(teamId: string, ws: Pick<Workspace, 'matches' | 'matchSets' | 'rallies' | 'rallyActions'>) {
  const sets = ws.matchSets.map((s) => setRows(teamId, s));
  return {
    matches: ws.matches.map((m) => matchRow(teamId, m)),
    match_sets: sets.map((s) => s.set),
    match_set_starters: sets.flatMap((s) => s.starters),
    rallies: ws.rallies.map((r) => rallyRow(teamId, r)),
    rally_actions: ws.rallyActions.map((a) => actionRow(teamId, a)),
  };
}

/* ───────── linhas → workspace mínimo da equipe ───────── */

function workspaceOf(db: Db, teamId: string): Workspace {
  const own = (table: string) => (db[table] ?? []).filter((r) => r.team_id === teamId);
  const startersBy = new Map<string, SetStarterRow[]>();
  for (const row of own('match_set_starters') as unknown as SetStarterRow[]) {
    const k = `${row.match_id}\u0001${row.set_number}`;
    startersBy.set(k, [...(startersBy.get(k) ?? []), row]);
  }
  const ws = createEmptyWorkspace();
  ws.players = (own('players') as never[]).map(playerFromRow);
  // Só o id das escalações importa aqui (a partida só guarda a referência).
  ws.lineups = own('lineups').map((r) => ({ id: String(r.id) }) as never);
  ws.matches = (own('matches') as unknown as MatchRow[]).map(matchFromRow);
  ws.matchSets = (own('match_sets') as unknown as SetRow[]).map((r) => setFromRows(r, startersBy.get(`${r.match_id}\u0001${r.number}`) ?? []));
  ws.rallies = (own('rallies') as unknown as RallyRow[]).map(rallyFromRow);
  ws.rallyActions = (own('rally_actions') as unknown as RallyActionRow[]).map(rallyActionFromRow);
  return ws;
}

/** Troca as linhas de partida da equipe pelas do workspace resultante (a função SQL real é uma transação só). */
function writeBack(db: Db, teamId: string, ws: Workspace) {
  const rows = matchTableRows(teamId, ws);
  for (const [table, list] of Object.entries(rows)) {
    db[table] = [...(db[table] ?? []).filter((r) => r.team_id !== teamId), ...list];
  }
}

const FUNCTIONS = ['start_set', 'record_rally', 'void_last_rally', 'cancel_empty_set', 'conclude_match', 'reopen_match', 'add_rally_action', 'void_rally_action'] as const;
export const isMatchFunction = (name: string): boolean => (FUNCTIONS as readonly string[]).includes(name);

const DENIED = 'Seu papel na equipe não permite registrar partidas.';

export function runMatchRpc(db: Db, role: (teamId: string) => Role | null, name: string, args: Row): RpcResult {
  const teamId = String(args.p_team);
  const mine = role(teamId);
  if (name === 'reopen_match') {
    if (mine !== 'coach') return err('42501', 'Só a comissão técnica pode reabrir uma partida concluída.', 403);
  } else if (mine !== 'coach' && mine !== 'analyst') return err('42501', DENIED, 403);

  const ws = structuredClone(workspaceOf(db, teamId));
  const matchId = String(args.p_match ?? '');
  const now = new Date().toISOString();
  try {
    let data: unknown = null;
    switch (name) {
      case 'start_set': {
        const p = args.p_set as Row;
        startSetOp(
          ws,
          matchId,
          {
            number: Number(p.number),
            firstServer: p.first_server as 'us' | 'them',
            liberoId: (p.libero_id as string | null) ?? null,
            createdAt: String(p.created_at ?? now),
            starters: (p.starters as Row[]).map((s) => ({ slot: Number(s.slot), playerId: String(s.player_id), role: s.role as 'oposto' })),
          },
          now,
        );
        break;
      }
      case 'record_rally': {
        const p = args.p_rally as Row;
        const result = recordRallyOp(ws, matchId, {
          id: String(p.id),
          attemptKey: String(p.attempt_key),
          setNumber: Number(p.set_number),
          expectedSeq: Number(p.expected_seq),
          winner: p.winner as 'us' | 'them',
          reason: (p.reason as never) ?? null,
          playerId: (p.player_id as string | null) ?? null,
          recordedAt: String(p.recorded_at ?? now),
          actions: ((p.actions as Row[] | undefined) ?? []).map((a) => ({
            id: String(a.id),
            attemptKey: String(a.attempt_key),
            playerId: String(a.player_id),
            fundamental: String(a.fundamental),
            outcome: String(a.outcome),
          })),
        });
        data = { duplicate: result.duplicate, rally: rallyRow(teamId, result.rally), actions: result.actions.map((a) => actionRow(teamId, a)) };
        break;
      }
      case 'void_last_rally':
        voidLastRallyOp(ws, matchId, String(args.p_rally), now);
        break;
      case 'cancel_empty_set':
        cancelEmptySetOp(ws, matchId, Number(args.p_number), now);
        break;
      case 'conclude_match':
        data = matchRow(teamId, concludeMatchOp(ws, matchId, now));
        break;
      case 'reopen_match':
        data = matchRow(teamId, reopenMatchOp(ws, matchId, now));
        break;
      case 'add_rally_action': {
        const p = args.p_action as Row;
        data = actionRow(
          teamId,
          addRallyActionOp(ws, {
            id: String(p.id),
            attemptKey: String(p.attempt_key),
            rallyId: String(p.rally_id),
            playerId: String(p.player_id),
            fundamental: String(p.fundamental),
            outcome: String(p.outcome),
            recordedAt: String(p.recorded_at ?? now),
          }),
        );
        break;
      }
      case 'void_rally_action':
        voidRallyActionOp(ws, String(args.p_action), now);
        break;
    }
    writeBack(db, teamId, ws);
    return { data, error: null, status: 200 };
  } catch (error) {
    // Mesmos códigos do SQL: 40001 = tela atrasada; P0001 = regra de negócio; P0002 = não existe.
    if (error instanceof ConflictError) return err('40001', error.message, 409);
    if (error instanceof IntegrityError) return err(/não existe/.test(error.message) ? 'P0002' : 'P0001', error.message);
    throw error;
  }
}
