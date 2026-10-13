import { toFundamentalResult, type FundamentalResult } from './fundamentals';
import { rotateStarters, type LineupStarter } from './lineup';
import { isCourtRole, type CourtRole } from './positions';

/**
 * PARTIDAS: formato, placar por set, rallies, rotação e ações técnicas. Regras PURAS (sem React, sem I/O).
 * Este arquivo é a especificação: o gateway local aplica exatamente estas funções e as funções SQL do banco
 * (supabase/migrations) repetem as mesmas regras, conferidas pelos mesmos cenários (src/domain/match.test.ts e
 * supabase/tests/matches.test.sql). Fórmulas e critérios: docs/METRICS.md.
 *
 * Modelo, em duas camadas que NÃO se confundem:
 *  - RALLY: quem venceu o ponto, quem sacava, em que rotação e (se conhecido) o motivo. É o que move o placar.
 *  - AÇÃO TÉCNICA: um fundamento observado (saque, recepção, ataque...) de um atleta, ligado a um rally. Um rally
 *    pode ter várias ações, ou nenhuma: "não registrado" nunca vira zero.
 */

export const SIDES = ['us', 'them'] as const;
export type Side = (typeof SIDES)[number];
export const otherSide = (side: Side): Side => (side === 'us' ? 'them' : 'us');
export const SIDE_LABEL: Record<Side, string> = { us: 'Alpha7', them: 'Adversário' };

export const MATCH_STATUSES = ['agendada', 'em_andamento', 'concluida'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];
export const MATCH_STATUS_LABEL: Record<MatchStatus, string> = {
  agendada: 'Agendada',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
};

/* ─────────────── formato ─────────────── */

export interface MatchFormat {
  /** Máximo de sets: 1, 3 ou 5 (vence quem ganhar a maioria). */
  bestOf: 1 | 3 | 5;
  /** Pontos nominais dos sets regulares. */
  setPoints: number;
  /** Pontos nominais do set decisivo (o último do formato, quando há mais de um set). */
  decidingSetPoints: number;
  /** Diferença mínima para fechar um set (vantagem de 2 pontos, por padrão). */
  minLead: number;
}

/** Padrão inicial: melhor de cinco, 25 pontos, decisivo até 15, diferença mínima de 2. Configurável por competição. */
export const DEFAULT_FORMAT: MatchFormat = { bestOf: 5, setPoints: 25, decidingSetPoints: 15, minLead: 2 };

export const BEST_OF_OPTIONS = [1, 3, 5] as const;

export function validateFormat(format: MatchFormat): string | null {
  if (!(BEST_OF_OPTIONS as readonly number[]).includes(format.bestOf)) return 'O formato deve ser de 1, 3 ou 5 sets.';
  for (const [label, value] of [
    ['Pontos do set', format.setPoints],
    ['Pontos do set decisivo', format.decidingSetPoints],
  ] as const) {
    if (!Number.isInteger(value) || value < 1 || value > 99) return `${label}: informe um número inteiro de 1 a 99.`;
  }
  if (!Number.isInteger(format.minLead) || format.minLead < 1 || format.minLead > 10) {
    return 'Diferença mínima: informe um número inteiro de 1 a 10.';
  }
  return null;
}

/** Sets que um lado precisa vencer: 3 (melhor de 5), 2 (de 3) ou 1. */
export const setsToWin = (format: MatchFormat): number => Math.ceil(format.bestOf / 2);

/** Pontos nominais do set `setNumber`: o último set do formato (com mais de um set) é o decisivo. */
export function setTarget(format: MatchFormat, setNumber: number): number {
  return format.bestOf > 1 && setNumber === format.bestOf ? format.decidingSetPoints : format.setPoints;
}

/**
 * Vencedor do set, ou null se ainda não acabou. NÃO basta atingir a pontuação nominal: é preciso tê-la atingido E
 * ter a diferença mínima (ex.: 25 a 24 continua; fecha em 26 a 24). O set não tem teto: segue até abrir a diferença.
 */
export function setWinner(us: number, them: number, target: number, minLead: number): Side | null {
  if (us >= target && us - them >= minLead) return 'us';
  if (them >= target && them - us >= minLead) return 'them';
  return null;
}

/* ─────────────── tipos persistidos ─────────────── */

export interface Match {
  id: string;
  opponent: string;
  competition: string;
  /** Texto "AAAA-MM-DDTHH:mm" (campo datetime-local), ou vazio. */
  scheduledAt: string;
  venue: string;
  /** Escalação salva usada como ponto de partida; a de cada set é guardada no próprio set. */
  lineupId: string | null;
  format: MatchFormat;
  status: MatchStatus;
  /** Resultado final em sets, só em partida concluída. */
  finalSetsUs: number | null;
  finalSetsThem: number | null;
  concludedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Titular de um set: posição inicial 0 a 5 (P1 a P6) e papel tático. */
export interface SetStarter {
  slot: number;
  playerId: string;
  role: CourtRole;
}

export interface MatchSet {
  matchId: string;
  /** 1 a 5. */
  number: number;
  /** Quem saca primeiro NESTE set. */
  firstServer: Side;
  /** Exatamente seis, uma por posição (slot 0 a 5). */
  starters: SetStarter[];
  liberoId: string | null;
  createdAt: string;
}

export const RALLY_REASONS = ['ace', 'ataque', 'bloqueio', 'erro_saque', 'erro_ataque', 'erro_recepcao', 'erro_outro', 'outro'] as const;
export type RallyReason = (typeof RALLY_REASONS)[number];

/** O motivo é sempre do ponto de vista de quem GANHOU o ponto: "erro_saque" é erro de saque de quem perdeu. */
export function reasonLabel(reason: RallyReason, winner: Side): string {
  const loser = winner === 'us' ? 'do adversário' : 'do Alpha7';
  switch (reason) {
    case 'ace':
      return winner === 'us' ? 'Ace' : 'Ace sofrido';
    case 'ataque':
      return winner === 'us' ? 'Ataque vencedor' : 'Ataque do adversário';
    case 'bloqueio':
      return winner === 'us' ? 'Bloqueio vencedor' : 'Bloqueio do adversário';
    case 'erro_saque':
      return `Erro de saque ${loser}`;
    case 'erro_ataque':
      return `Erro de ataque ${loser}`;
    case 'erro_recepcao':
      return `Erro de recepção ${loser}`;
    case 'erro_outro':
      return winner === 'us' ? 'Erro do adversário' : 'Erro do Alpha7';
    case 'outro':
      return 'Outro motivo';
  }
}

export const isRallyReason = (value: unknown): value is RallyReason =>
  typeof value === 'string' && (RALLY_REASONS as readonly string[]).includes(value);

export interface Rally {
  id: string;
  matchId: string;
  setNumber: number;
  /** Posição do rally entre os ATIVOS do set (1, 2, 3...). Um rally desfeito libera o seu número. */
  seq: number;
  /** Quem sacava quando o rally começou. */
  servingSide: Side;
  winnerSide: Side;
  /** Rotação do Alpha7 (0 a 5) quando o rally começou, contada desde o início do set. */
  rotation: number;
  /** Atleta do Alpha7 que sacava (só quando o Alpha7 sacava). */
  serverPlayerId: string | null;
  reason: RallyReason | null;
  /** Atleta do Alpha7 envolvido (quem fez o ponto ou quem errou), quando conhecido. */
  playerId: string | null;
  attemptKey: string;
  recordedAt: string;
  voidedAt: string | null;
}

/** Ação técnica observada em um rally. Só atletas do Alpha7. `fundamental` + `outcome` formam um par validado. */
export type RallyAction = FundamentalResult & {
  id: string;
  matchId: string;
  rallyId: string;
  playerId: string;
  attemptKey: string;
  recordedAt: string;
  voidedAt: string | null;
};

/* ─────────────── estado derivado ─────────────── */

export const activeRallies = <R extends { voidedAt: string | null }>(rallies: readonly R[]): R[] => rallies.filter((r) => r.voidedAt === null);

export interface Score {
  us: number;
  them: number;
}

export function scoreOf(rallies: readonly Rally[]): Score {
  const score = { us: 0, them: 0 };
  for (const rally of activeRallies(rallies)) score[rally.winnerSide] += 1;
  return score;
}

export interface SetState {
  set: MatchSet;
  /** Rallies ATIVOS do set, em ordem. */
  rallies: Rally[];
  target: number;
  score: Score;
  winner: Side | null;
  closed: boolean;
}

export interface MatchState {
  match: Match;
  sets: SetState[];
  setsUs: number;
  setsThem: number;
  /** Lado que já ganhou sets suficientes para decidir a partida, ou null. */
  decided: Side | null;
  /** Último set criado (o que está em jogo ou acabou de fechar), ou null. */
  current: SetState | null;
  /** Número do próximo set a iniciar, ou null se não pode iniciar (partida decidida, concluída ou set em jogo). */
  nextSetNumber: number | null;
  /** Último rally ativo da partida inteira (candidato a "desfazer"), ou null. */
  lastRally: Rally | null;
}

export function matchState(match: Match, sets: readonly MatchSet[], rallies: readonly Rally[]): MatchState {
  const ownSets = sets.filter((s) => s.matchId === match.id).sort((a, b) => a.number - b.number);
  const states: SetState[] = ownSets.map((set) => {
    const own = activeRallies(rallies.filter((r) => r.matchId === match.id && r.setNumber === set.number)).sort((a, b) => a.seq - b.seq);
    const target = setTarget(match.format, set.number);
    const score = scoreOf(own);
    const winner = setWinner(score.us, score.them, target, match.format.minLead);
    return { set, rallies: own, target, score, winner, closed: winner !== null };
  });
  const setsUs = states.filter((s) => s.winner === 'us').length;
  const setsThem = states.filter((s) => s.winner === 'them').length;
  const needed = setsToWin(match.format);
  const decided: Side | null = setsUs >= needed ? 'us' : setsThem >= needed ? 'them' : null;
  const current = states[states.length - 1] ?? null;
  const next = (current?.set.number ?? 0) + 1;
  const canStart = match.status !== 'concluida' && decided === null && (current === null || current.closed) && next <= match.format.bestOf;
  const lastRally = current?.rallies[current.rallies.length - 1] ?? null;
  return { match, sets: states, setsUs, setsThem, decided, current, nextSetNumber: canStart ? next : null, lastRally };
}

/** Contexto do PRÓXIMO rally de um set: número, quem saca, rotação e sacador. */
export interface RallyContext {
  seq: number;
  servingSide: Side;
  rotation: number;
  serverPlayerId: string | null;
}

/**
 * Máquina de estados do saque e do rodízio:
 *  - quem ganhou o último rally saca o próximo (o saque fica com quem ganha o ponto);
 *  - o Alpha7 só gira quando ganha um rally que o ADVERSÁRIO sacava (conquista o saque e faz o rodízio);
 *  - se o Alpha7 sacava e ganhou, mantém rotação e saque; se o adversário sacava e ganhou, nada muda para nós;
 *  - o sacador do Alpha7 é quem está em P1 naquela rotação: o titular da posição `rotation` da formação inicial.
 * A rotação recomeça em 0 a cada set (cada set tem a sua formação inicial e o seu primeiro sacador).
 */
export function nextContext(state: SetState): RallyContext {
  const last = state.rallies[state.rallies.length - 1];
  const servingSide = last ? last.winnerSide : state.set.firstServer;
  const rotation = last ? last.rotation + (last.winnerSide === 'us' && last.servingSide === 'them' ? 1 : 0) : 0;
  const bySlot = [...state.set.starters].sort((a, b) => a.slot - b.slot);
  const server = servingSide === 'us' ? (bySlot[rotation % 6] ?? null) : null;
  return { seq: (last?.seq ?? 0) + 1, servingSide, rotation, serverPlayerId: server?.playerId ?? null };
}

/** Quem ocupa P1 a P6 na rotação indicada (índice 0 = P1). */
export function courtPositions(set: MatchSet, rotation: number): (LineupStarter & { playerId: string })[] {
  const initial = [...set.starters].sort((a, b) => a.slot - b.slot).map((s) => ({ playerId: s.playerId, role: s.role }));
  return rotateStarters(initial, rotation).flatMap((s) => (s ? [s as LineupStarter & { playerId: string }] : []));
}

/** Posição (1 a 6) em que está o levantador na rotação, ou null se a formação não tem um titular levantador. */
export function setterPosition(set: MatchSet, rotation: number): number | null {
  const index = courtPositions(set, rotation).findIndex((s) => s.role === 'levantador');
  return index === -1 ? null : index + 1;
}

/* ─────────────── planos de operação ─────────────── */

export type Plan<T> = { ok: true; value: T } | { ok: false; reason: string; conflict?: boolean };
const fail = (reason: string, conflict = false): { ok: false; reason: string; conflict?: boolean } => (conflict ? { ok: false, reason, conflict } : { ok: false, reason });

export interface ActionInput {
  id: string;
  attemptKey: string;
  playerId: string;
  fundamental: string;
  outcome: string;
}

export interface RallyInput {
  id: string;
  /** Chave de idempotência: o mesmo toque nunca vira dois rallies. */
  attemptKey: string;
  setNumber: number;
  /** Número de rally que a tela espera: se outra pessoa registrou antes, é conflito (nada é gravado). */
  expectedSeq: number;
  winner: Side;
  reason: RallyReason | null;
  playerId: string | null;
  recordedAt: string;
  actions: ActionInput[];
}

/** Coerência entre o motivo e quem sacava: "ace" é de quem saca; erro de saque e de recepção, do outro lado. */
export function reasonProblem(reason: RallyReason | null, winner: Side, servingSide: Side): string | null {
  if (reason === 'ace' && winner !== servingSide) return 'Ace só vale para quem estava sacando.';
  if (reason === 'erro_saque' && winner === servingSide) return 'Erro de saque só vale quando quem sacava perde o ponto.';
  if (reason === 'erro_recepcao' && winner !== servingSide) return 'Erro de recepção só vale quando quem recebia perde o ponto.';
  return null;
}

/**
 * Valida e monta um rally (e as ações técnicas dele). Idempotente por `attemptKey`: repetir o envio devolve o
 * rally original como `duplicate`, sem mudar nada. Recusa: partida concluída, set inexistente, set que não é o atual,
 * set já encerrado pela regra de pontuação, conflito de número, motivo incoerente, atleta ou ação inválidos.
 */
export function planRally(
  state: MatchState,
  allRallies: readonly Rally[],
  allActions: readonly RallyAction[],
  input: RallyInput,
  rosterIds: ReadonlySet<string>,
): Plan<{ rally: Rally; actions: RallyAction[]; duplicate: boolean }> {
  const existing = allRallies.find((r) => r.attemptKey === input.attemptKey);
  if (existing) {
    const own = allActions.filter((a) => a.rallyId === existing.id);
    return { ok: true, value: { rally: existing, actions: own, duplicate: true } };
  }
  if (state.match.status === 'concluida') return fail('A partida está concluída. Reabra a partida para corrigir.');
  const current = state.current;
  if (!current || current.set.number !== input.setNumber) return fail('Este não é o set em andamento.', true);
  if (current.closed) return fail('O set já está encerrado. Inicie o próximo set ou corrija o último ponto.');
  const context = nextContext(current);
  if (input.expectedSeq !== context.seq) return fail('Outra pessoa registrou um ponto neste meio-tempo. A tela foi atualizada.', true);
  if (!(SIDES as readonly string[]).includes(input.winner)) return fail('Informe quem ganhou o ponto.');
  if (input.reason !== null && !isRallyReason(input.reason)) return fail('Motivo do ponto desconhecido.');
  const incoherent = reasonProblem(input.reason, input.winner, context.servingSide);
  if (incoherent) return fail(incoherent);
  if (input.playerId !== null && !rosterIds.has(input.playerId)) return fail('O atleta informado não está no elenco.');

  const actions: RallyAction[] = [];
  const keys = new Set<string>();
  for (const draft of input.actions) {
    const result = toFundamentalResult(draft.fundamental, draft.outcome);
    if (!result) return fail('Ação técnica inválida: resultado não vale para o fundamento.');
    if (!rosterIds.has(draft.playerId)) return fail('O atleta da ação técnica não está no elenco.');
    if (keys.has(draft.attemptKey) || allActions.some((a) => a.attemptKey === draft.attemptKey)) return fail('Ação técnica repetida.');
    keys.add(draft.attemptKey);
    actions.push({ ...result, id: draft.id, matchId: state.match.id, rallyId: input.id, playerId: draft.playerId, attemptKey: draft.attemptKey, recordedAt: input.recordedAt, voidedAt: null });
  }
  const rally: Rally = {
    id: input.id,
    matchId: state.match.id,
    setNumber: input.setNumber,
    seq: context.seq,
    servingSide: context.servingSide,
    winnerSide: input.winner,
    rotation: context.rotation,
    serverPlayerId: context.serverPlayerId,
    reason: input.reason,
    playerId: input.playerId,
    attemptKey: input.attemptKey,
    recordedAt: input.recordedAt,
    voidedAt: null,
  };
  return { ok: true, value: { rally, actions, duplicate: false } };
}

/**
 * Desfazer = ANULAR o último rally ativo da partida (e as ações dele). Só o último, e só do set atual: desfazer
 * em ordem mantém o placar e o histórico coerentes. Se o set tinha fechado, ele volta a estar em andamento (é o
 * fluxo explícito de correção). `rallyId` é o que a tela acredita ser o último: se não for, é conflito.
 */
export function planVoidLast(state: MatchState, rallyId: string): Plan<{ rally: Rally }> {
  if (state.match.status === 'concluida') return fail('A partida está concluída. Reabra a partida para corrigir.');
  const last = state.lastRally;
  if (!last) return fail('Não há ponto para desfazer neste set.');
  if (last.id !== rallyId) return fail('O último ponto mudou. A tela foi atualizada.', true);
  return { ok: true, value: { rally: last } };
}

export interface StartSetInput {
  number: number;
  firstServer: Side;
  starters: SetStarter[];
  liberoId: string | null;
  createdAt: string;
}

/** Valida o início de um set: ordem dos sets, formação com seis titulares distintos e líbero fora dela. */
export function planStartSet(state: MatchState, input: StartSetInput, rosterIds: ReadonlySet<string>): Plan<{ set: MatchSet }> {
  if (state.match.status === 'concluida') return fail('A partida está concluída.');
  if (state.nextSetNumber === null) {
    if (state.decided) return fail('A partida já está decidida pelo formato: não há próximo set.');
    return fail('Termine o set em andamento antes de iniciar outro.', true);
  }
  if (input.number !== state.nextSetNumber) return fail(`O próximo set é o ${state.nextSetNumber}.`, true);
  if (!(SIDES as readonly string[]).includes(input.firstServer)) return fail('Informe quem saca primeiro.');
  if (input.starters.length !== 6) return fail('A formação inicial precisa de seis titulares.');
  const slots = new Set(input.starters.map((s) => s.slot));
  if (slots.size !== 6 || [...slots].some((s) => !Number.isInteger(s) || s < 0 || s > 5)) return fail('Cada posição de P1 a P6 deve ter exatamente um titular.');
  const ids = input.starters.map((s) => s.playerId);
  if (new Set(ids).size !== 6) return fail('Há atleta repetido na formação.');
  if (ids.some((id) => !rosterIds.has(id))) return fail('Há atleta que não está no elenco.');
  if (input.starters.some((s) => !isCourtRole(s.role))) return fail('Papel tático inválido.');
  if (input.liberoId !== null && (!rosterIds.has(input.liberoId) || ids.includes(input.liberoId))) return fail('O líbero deve ser um atleta do elenco fora dos seis titulares.');
  const set: MatchSet = {
    matchId: state.match.id,
    number: input.number,
    firstServer: input.firstServer,
    starters: [...input.starters].sort((a, b) => a.slot - b.slot),
    liberoId: input.liberoId,
    createdAt: input.createdAt,
  };
  return { ok: true, value: { set } };
}

/**
 * Só se pode cancelar o ÚLTIMO set e só se NUNCA teve nenhum rally (nem desfeito): é desfazer o "iniciar set", e
 * apagar um set que já teve registros apagaria histórico. `allRallies` inclui os anulados.
 */
export function planCancelEmptySet(state: MatchState, number: number, allRallies: readonly Rally[]): Plan<{ number: number }> {
  if (state.match.status === 'concluida') return fail('A partida está concluída.');
  const current = state.current;
  if (!current || current.set.number !== number) return fail('Só o último set pode ser cancelado.', true);
  if (allRallies.some((r) => r.matchId === state.match.id && r.setNumber === number)) {
    return fail('Este set já tem registros (mesmo desfeitos) e não pode ser cancelado.');
  }
  return { ok: true, value: { number } };
}

export interface Conclusion {
  finalSetsUs: number;
  finalSetsThem: number;
  /** Set em andamento (com pontos) que NÃO entra no resultado, para a tela avisar antes de confirmar. */
  unfinishedSet: SetState | null;
  /** O formato já decidiu a partida (alguém atingiu os sets necessários). */
  decided: boolean;
}

/** Resultado em sets: só contam sets FECHADOS pela regra de pontuação. Encerrar antes da hora é permitido, com aviso. */
export function planConclude(state: MatchState): Plan<Conclusion> {
  if (state.match.status === 'concluida') return fail('A partida já está concluída.');
  if (state.sets.length === 0) return fail('Inicie ao menos um set antes de encerrar a partida.');
  const open = state.current && !state.current.closed && state.current.rallies.length > 0 ? state.current : null;
  return { ok: true, value: { finalSetsUs: state.setsUs, finalSetsThem: state.setsThem, unfinishedSet: open, decided: state.decided !== null } };
}

/* ─────────────── formulário ─────────────── */

export interface MatchDraft {
  opponent: string;
  competition: string;
  scheduledAt: string;
  venue: string;
  lineupId: string | null;
  format: MatchFormat;
}

export const OPPONENT_MAX = 80;
export const MATCH_TEXT_MAX = 120;

export type MatchErrors = Partial<Record<'opponent' | 'competition' | 'scheduledAt' | 'venue' | 'format', string>>;

export function validateMatchDraft(draft: MatchDraft): { ok: true; value: MatchDraft } | { ok: false; errors: MatchErrors } {
  const errors: MatchErrors = {};
  const opponent = draft.opponent.trim();
  if (opponent.length < 2) errors.opponent = 'Informe o adversário (mínimo de 2 letras).';
  else if (opponent.length > OPPONENT_MAX) errors.opponent = `O nome pode ter até ${OPPONENT_MAX} caracteres.`;
  if (draft.competition.trim().length > MATCH_TEXT_MAX) errors.competition = `O campeonato pode ter até ${MATCH_TEXT_MAX} caracteres.`;
  if (draft.venue.trim().length > MATCH_TEXT_MAX) errors.venue = `O local pode ter até ${MATCH_TEXT_MAX} caracteres.`;
  if (draft.scheduledAt !== '' && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(draft.scheduledAt)) errors.scheduledAt = 'Data e horário inválidos.';
  const formatProblem = validateFormat(draft.format);
  if (formatProblem) errors.format = formatProblem;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { ...draft, opponent, competition: draft.competition.trim(), venue: draft.venue.trim() } };
}

/** Texto do resultado: "3 x 1", ou null enquanto não há resultado. */
export function resultText(match: Match): string | null {
  return match.finalSetsUs === null || match.finalSetsThem === null ? null : `${match.finalSetsUs} x ${match.finalSetsThem}`;
}

export type MatchOutcome = 'vitoria' | 'derrota' | 'empate' | null;
export function outcomeOf(match: Match): MatchOutcome {
  if (match.finalSetsUs === null || match.finalSetsThem === null) return null;
  return match.finalSetsUs > match.finalSetsThem ? 'vitoria' : match.finalSetsUs < match.finalSetsThem ? 'derrota' : 'empate';
}

/** Totais por motivo para o resumo da partida (só rallies ativos). Rally sem motivo fica em "não informado". */
export function reasonTotals(rallies: readonly Rally[]): { reason: RallyReason | null; winner: Side; count: number }[] {
  const map = new Map<string, { reason: RallyReason | null; winner: Side; count: number }>();
  for (const rally of activeRallies(rallies)) {
    const key = `${rally.winnerSide}:${rally.reason ?? ''}`;
    const entry = map.get(key) ?? { reason: rally.reason, winner: rally.winnerSide, count: 0 };
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()];
}

/** Partidas CONCLUÍDAS e quantas foram vitórias (mais sets que o adversário). Partida não concluída não conta. */
export function matchRecord(matches: readonly Match[]): { played: number; wins: number } {
  const done = matches.filter((m) => m.status === 'concluida');
  return { played: done.length, wins: done.filter((m) => outcomeOf(m) === 'vitoria').length };
}

/**
 * A partida a destacar como "próxima": a que está em andamento; senão a agendada de data mais próxima (sem data
 * vem por último). Não inventa nada: sem partida aberta, devolve null.
 */
export function upcomingMatch(matches: readonly Match[]): Match | null {
  const open = matches.filter((m) => m.status !== 'concluida');
  const rank = (m: Match) => (m.status === 'em_andamento' ? 0 : 1);
  return (
    [...open].sort(
      (a, b) =>
        rank(a) - rank(b) ||
        (a.scheduledAt === '' ? 1 : 0) - (b.scheduledAt === '' ? 1 : 0) ||
        a.scheduledAt.localeCompare(b.scheduledAt) ||
        a.createdAt.localeCompare(b.createdAt),
    )[0] ?? null
  );
}
