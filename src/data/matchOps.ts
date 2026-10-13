import { toFundamentalResult } from '@/domain/fundamentals';
import {
  matchState,
  planCancelEmptySet,
  planConclude,
  planRally,
  planStartSet,
  planVoidLast,
  type ActionInput,
  type Match,
  type MatchSet,
  type MatchState,
  type Plan,
  type Rally,
  type RallyAction,
  type RallyInput,
  type StartSetInput,
} from '@/domain/match';
import { ConflictError, IntegrityError } from './gateway';
import type { Workspace } from './types';

/**
 * Operações de partida aplicadas a um Workspace em memória (gateway local e simulador de testes). Cada uma aplica as
 * regras PURAS de domain/match.ts e MUTA o workspace recebido: quem chama passa uma cópia e só grava se nada falhar,
 * então a operação é tudo ou nada. O backend remoto repete as mesmas regras em funções SQL transacionais
 * (supabase/migrations/…_matches.sql), conferidas pelos mesmos cenários.
 */

const rosterOf = (ws: Workspace): Set<string> => new Set(ws.players.map((p) => p.id));

function unwrap<T>(plan: Plan<T>): T {
  if (plan.ok) return plan.value;
  throw plan.conflict ? new ConflictError(plan.reason) : new IntegrityError(plan.reason);
}

export function findMatch(ws: Workspace, matchId: string): Match {
  const match = ws.matches.find((m) => m.id === matchId);
  if (!match) throw new IntegrityError('Esta partida não existe mais.');
  return match;
}

export const stateOf = (ws: Workspace, matchId: string): MatchState => matchState(findMatch(ws, matchId), ws.matchSets, ws.rallies);

const replaceMatch = (ws: Workspace, next: Match) => {
  ws.matches = ws.matches.map((m) => (m.id === next.id ? next : m));
};

/** Cria ou edita só os dados do jogo. Status e resultado nunca vêm do chamador (mesma regra das permissões do banco). */
export function saveMatchOp(ws: Workspace, match: Match): Match {
  const existing = ws.matches.find((m) => m.id === match.id);
  if (match.lineupId !== null && !ws.lineups.some((l) => l.id === match.lineupId)) {
    throw new IntegrityError('A escalação escolhida não existe mais.');
  }
  if (!existing) {
    const created: Match = { ...match, status: 'agendada', finalSetsUs: null, finalSetsThem: null, concludedAt: null };
    ws.matches = [...ws.matches, created];
    return created;
  }
  const f = existing.format;
  const g = match.format;
  const formatChanged = f.bestOf !== g.bestOf || f.setPoints !== g.setPoints || f.decidingSetPoints !== g.decidingSetPoints || f.minLead !== g.minLead;
  if (formatChanged && ws.matchSets.some((s) => s.matchId === match.id)) {
    throw new IntegrityError('O formato não pode mudar depois que o primeiro set foi iniciado.');
  }
  const saved: Match = {
    ...existing,
    opponent: match.opponent,
    competition: match.competition,
    scheduledAt: match.scheduledAt,
    venue: match.venue,
    lineupId: match.lineupId,
    format: match.format,
    updatedAt: match.updatedAt,
  };
  replaceMatch(ws, saved);
  return saved;
}

export function deleteMatchOp(ws: Workspace, matchId: string): void {
  ws.matches = ws.matches.filter((m) => m.id !== matchId);
  ws.matchSets = ws.matchSets.filter((s) => s.matchId !== matchId);
  ws.rallies = ws.rallies.filter((r) => r.matchId !== matchId);
  ws.rallyActions = ws.rallyActions.filter((a) => a.matchId !== matchId);
}

export function startSetOp(ws: Workspace, matchId: string, input: StartSetInput, now: string): { set: MatchSet; match: Match } {
  const state = stateOf(ws, matchId);
  const { set } = unwrap(planStartSet(state, input, rosterOf(ws)));
  ws.matchSets = [...ws.matchSets, set];
  const match: Match = state.match.status === 'agendada' ? { ...state.match, status: 'em_andamento', updatedAt: now } : state.match;
  replaceMatch(ws, match);
  return { set, match };
}

export function recordRallyOp(ws: Workspace, matchId: string, input: RallyInput): { rally: Rally; actions: RallyAction[]; duplicate: boolean } {
  const state = stateOf(ws, matchId);
  const result = unwrap(planRally(state, ws.rallies, ws.rallyActions, input, rosterOf(ws)));
  if (!result.duplicate) {
    ws.rallies = [...ws.rallies, result.rally];
    ws.rallyActions = [...ws.rallyActions, ...result.actions];
  }
  return result;
}

export function voidLastRallyOp(ws: Workspace, matchId: string, rallyId: string, voidedAt: string): void {
  const { rally } = unwrap(planVoidLast(stateOf(ws, matchId), rallyId));
  ws.rallies = ws.rallies.map((r) => (r.id === rally.id ? { ...r, voidedAt } : r));
  ws.rallyActions = ws.rallyActions.map((a) => (a.rallyId === rally.id && a.voidedAt === null ? { ...a, voidedAt } : a));
}

export function cancelEmptySetOp(ws: Workspace, matchId: string, number: number, now: string): Match {
  const state = stateOf(ws, matchId);
  unwrap(planCancelEmptySet(state, number, ws.rallies));
  ws.matchSets = ws.matchSets.filter((s) => !(s.matchId === matchId && s.number === number));
  const noSetsLeft = !ws.matchSets.some((s) => s.matchId === matchId);
  const match: Match = noSetsLeft && state.match.status === 'em_andamento' ? { ...state.match, status: 'agendada', updatedAt: now } : state.match;
  replaceMatch(ws, match);
  return match;
}

export function concludeMatchOp(ws: Workspace, matchId: string, concludedAt: string): Match {
  const state = stateOf(ws, matchId);
  const conclusion = unwrap(planConclude(state));
  const match: Match = {
    ...state.match,
    status: 'concluida',
    finalSetsUs: conclusion.finalSetsUs,
    finalSetsThem: conclusion.finalSetsThem,
    concludedAt,
    updatedAt: concludedAt,
  };
  replaceMatch(ws, match);
  return match;
}

export function reopenMatchOp(ws: Workspace, matchId: string, now: string): Match {
  const match = findMatch(ws, matchId);
  if (match.status !== 'concluida') throw new IntegrityError('A partida não está concluída.');
  const reopened: Match = { ...match, status: 'em_andamento', finalSetsUs: null, finalSetsThem: null, concludedAt: null, updatedAt: now };
  replaceMatch(ws, reopened);
  return reopened;
}

export function addRallyActionOp(ws: Workspace, input: ActionInput & { rallyId: string; recordedAt: string }): RallyAction {
  const existing = ws.rallyActions.find((a) => a.attemptKey === input.attemptKey);
  if (existing) return existing; // idempotente
  const rally = ws.rallies.find((r) => r.id === input.rallyId);
  if (!rally) throw new IntegrityError('O ponto desta ação não existe.');
  const match = findMatch(ws, rally.matchId);
  if (match.status === 'concluida') throw new IntegrityError('A partida está concluída. Reabra a partida para corrigir.');
  if (rally.voidedAt !== null) throw new IntegrityError('Este ponto foi desfeito.');
  const result = toFundamentalResult(input.fundamental, input.outcome);
  if (!result) throw new IntegrityError('Ação técnica inválida: resultado não vale para o fundamento.');
  if (!rosterOf(ws).has(input.playerId)) throw new IntegrityError('O atleta da ação técnica não está no elenco.');
  const action: RallyAction = { ...result, id: input.id, matchId: rally.matchId, rallyId: rally.id, playerId: input.playerId, attemptKey: input.attemptKey, recordedAt: input.recordedAt, voidedAt: null };
  ws.rallyActions = [...ws.rallyActions, action];
  return action;
}

export function voidRallyActionOp(ws: Workspace, actionId: string, voidedAt: string): void {
  const action = ws.rallyActions.find((a) => a.id === actionId);
  if (!action) throw new IntegrityError('A ação a desfazer não existe.');
  if (findMatch(ws, action.matchId).status === 'concluida') throw new IntegrityError('A partida está concluída. Reabra a partida para corrigir.');
  if (action.voidedAt !== null) return;
  ws.rallyActions = ws.rallyActions.map((a) => (a.id === actionId ? { ...a, voidedAt } : a));
}
