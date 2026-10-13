import type { Lineup } from '@/domain/lineup';
import type { Evaluation, Player } from '@/domain/player';
import { photoPath } from '@/domain/photo';
import type { ActionInput, Match, MatchSet, Rally, RallyAction, RallyInput, StartSetInput } from '@/domain/match';
import type { Training, TrainingEvent, TrainingExercise } from '@/domain/training';
import {
  ConflictError,
  IntegrityError,
  PermissionDeniedError,
  RemoteDataError,
  RemoteOperationUnavailableError,
  RemoteUnavailableError,
  SessionExpiredError,
  type DataGateway,
  type RawCopy,
  type SnapshotInfo,
  type StorageUsage,
} from '../gateway';
import type { Settings, Workspace } from '../types';
import type { AlphaSupabaseClient } from './client';
import type { Database } from './database.types';
import {
  evaluationFromRow,
  evaluationToRow,
  eventFromRow,
  eventToRow,
  exerciseFromRow,
  exerciseToRow,
  lineupFromRows,
  jsonRow,
  lineupToRows,
  matchFromRow,
  matchToInsertRow,
  matchToUpdateRow,
  participantRows,
  playerFromRow,
  playerToRow,
  rallyActionFromRow,
  rallyFromRow,
  setFromRows,
  trainingFromRows,
  trainingToRow,
  weightsFromRows,
  weightsToRows,
  type BenchRow,
  type EventRow,
  type ExerciseRow,
  type LineupRow,
  type MatchRow,
  type ParticipantRow,
  type RallyActionRow,
  type RallyRow,
  type SetRow,
  type SetStarterRow,
  type StarterRow,
} from './mappers';

type Tables = Database['public']['Tables'];
type TableName = keyof Tables;

/** O que o gateway usa do cliente: só consultas e funções. A sessão de login é assunto do AuthProvider. */
export type RemoteClient = Pick<AlphaSupabaseClient, 'from' | 'rpc' | 'storage'>;

export interface SupabaseGatewayOptions {
  client: RemoteClient;
  /** Equipe aberta. TODA consulta e gravação é restrita a ela (além da RLS do banco). */
  teamId: string;
  /** Pessoa logada: vai em `voided_by` quando um registro é anulado. */
  userId: string;
}

/** Formato mínimo de um erro do PostgREST. */
interface PgError {
  code?: string | null;
  message?: string | null;
  details?: string | null;
}
interface PgResult {
  error: PgError | null;
  status?: number;
}

const RALLY_KEYS = ['id', 'match_id', 'set_number', 'seq', 'serving_side', 'winner_side', 'rotation', 'server_player_id', 'reason', 'player_id', 'attempt_key', 'recorded_at', 'voided_at'] as const;
const ACTION_KEYS = ['id', 'match_id', 'rally_id', 'player_id', 'fundamental', 'outcome', 'attempt_key', 'recorded_at', 'voided_at'] as const;

const PHOTO_BUCKET = 'player-photos';
const PHOTO_URL_SECONDS = 3600;

/** Traduz um erro do Storage (a RLS do bucket decide quem escreve) para uma mensagem compreensível. */
export function mapStorageError(error: { message?: string; statusCode?: string | number }): Error {
  const message = error.message ?? '';
  const status = String(error.statusCode ?? '');
  if (/row-level security|unauthorized|not authorized|forbidden/i.test(message) || status === '403') {
    return new PermissionDeniedError('Só a comissão técnica pode enviar, trocar ou remover fotos.');
  }
  if (/jwt expired/i.test(message) || status === '401') return new SessionExpiredError();
  if (/exceeded|too large|payload|size/i.test(message) || status === '413') return new IntegrityError('A foto é grande demais para guardar. Escolha uma imagem menor.');
  if (/mime|not supported|invalid/i.test(message)) return new IntegrityError('Formato de imagem não aceito. Use JPEG, PNG ou WebP.');
  if (/failed to fetch|network|load failed/i.test(message)) return new RemoteUnavailableError();
  return new RemoteDataError('falha ao enviar ou ler a foto');
}

/** O PostgREST devolve no máximo 1000 linhas por requisição: lemos em páginas. */
const PAGE_SIZE = 1000;

interface PageQuery {
  eq(column: string, value: string): PageQuery;
  order(column: string, options?: { ascending: boolean }): PageQuery;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: PgError | null; status?: number }>;
}

const text = (error: PgError) => `${error.message ?? ''} ${error.details ?? ''}`;

/**
 * Traduz um erro do banco/rede para um erro do aplicativo, com mensagem compreensível em português.
 * A decisão de permissão é SEMPRE do banco (RLS): aqui só se explica a recusa.
 */
export function mapRemoteError(error: PgError, status?: number): Error {
  const code = error.code ?? '';
  const message = text(error);

  if (status === 401 || code === 'PGRST301' || code === 'PGRST303' || /jwt expired/i.test(message)) return new SessionExpiredError();
  if (code === '42501' || status === 403) return new PermissionDeniedError();
  // Funções de partida: 40001 = a tela estava atrasada; P0001/P0002 = regra de negócio, com mensagem já em português.
  if (code === '40001') return new ConflictError(error.message ?? 'Os dados da partida mudaram.');
  if (code === 'P0001') return new IntegrityError(error.message ?? 'Regra da partida violada.');
  if (code === 'P0002') return new IntegrityError('Esta partida não existe mais.');
  if (status === 0 || /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message)) {
    return new RemoteUnavailableError();
  }

  if (code === '23505') {
    if (/jersey_number/.test(message)) return new IntegrityError('Esse número de camisa já está em uso por outro atleta.');
    if (/attempt_key/.test(message)) return new IntegrityError('Este registro de tentativa já existe.');
    return new IntegrityError('Já existe um registro com este identificador.');
  }
  if (code === '23503') {
    if (/update or delete on table "training_exercises"/.test(message)) return new IntegrityError('Não é possível remover um exercício que tem registros.');
    if (/update or delete/.test(message)) return new IntegrityError('Não é possível excluir: outros registros dependem deste.');
    if (/exercise_id_training_id/.test(message)) return new IntegrityError('O exercício deste registro não pertence ao treino.');
    if (/training_events_team_id_player_id/.test(message)) return new IntegrityError('O atleta deste registro não existe.');
    if (/training_events_team_id_training_id/.test(message)) return new IntegrityError('O treino deste registro não existe.');
    if (/lineup|libero|match_set|rallies|rally_actions/.test(message)) return new IntegrityError('Há atleta que não está mais no elenco.');
    if (/training_participants|trainings/.test(message)) return new IntegrityError('Há participante que não está mais no elenco.');
    if (/evaluations/.test(message)) return new IntegrityError('Este atleta não existe mais no elenco.');
    return new IntegrityError('A operação deixaria referências quebradas.');
  }
  if (code === '23514') {
    // Gatilhos do banco falam português ("O atleta deste registro não participa do treino."); as restrições CHECK não.
    return new IntegrityError(/violates check constraint/.test(message) ? 'Os dados não passaram nas regras do banco.' : (error.message ?? 'Regra do banco violada.'));
  }
  return new RemoteDataError(`falha inesperada${code ? ` (${code})` : ''}`);
}

function check(result: PgResult): void {
  if (result.error) throw mapRemoteError(result.error, result.status);
}

/** Troca de erro de rede lançado (fetch que rejeita) pelo erro tipado; deixa os demais passarem. */
async function guard<T>(work: () => PromiseLike<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    if (error instanceof Error && (/fetch|network/i.test(error.message) || error.name === 'TypeError')) throw new RemoteUnavailableError();
    throw error;
  }
}

/**
 * Backend remoto: os dados da equipe no Supabase. Implementa o MESMO contrato do LocalStorageGateway,
 * operação por operação (não grava o workspace inteiro de uma vez). Fonte da verdade do esquema:
 * supabase/migrations/. A segurança efetiva é a RLS do PostgreSQL; este código só traduz e explica erros.
 *
 * Limites desta fase (ver supabase/README.md): sem transação entre tabelas (escalações e treinos gravam
 * em etapas ordenadas para falhar sem perder dados), sem substituir o workspace inteiro, sem cópia de
 * segurança nem desfazer de substituição, sem atualização em tempo real entre abas.
 */
export class SupabaseGateway implements DataGateway {
  readonly kind = 'remote' as const;
  readonly persistent = true;
  private readonly client: RemoteClient;
  private readonly teamId: string;
  private readonly userId: string;

  constructor(options: SupabaseGatewayOptions) {
    if (!options.teamId) throw new Error('SupabaseGateway precisa de uma equipe selecionada.');
    if (!options.userId) throw new Error('SupabaseGateway precisa de uma pessoa autenticada.');
    this.client = options.client;
    this.teamId = options.teamId;
    this.userId = options.userId;
  }

  /* ───────── leitura ───────── */

  /** Lê todas as linhas da equipe, em páginas, com ordem total estável (a mesma linha não se repete nem some). */
  private async fetchAll<T extends TableName>(table: T, orderBy: readonly string[]): Promise<Tables[T]['Row'][]> {
    const rows: Tables[T]['Row'][] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const result = await guard(() => {
        // Consulta dinâmica por nome de tabela: o tipo exato por tabela não se resolve numa união.
        let query = this.client.from(table).select('*') as unknown as PageQuery;
        query = query.eq('team_id', this.teamId);
        for (const column of orderBy) query = query.order(column, { ascending: true });
        return query.range(from, from + PAGE_SIZE - 1);
      });
      check(result);
      const page = (result.data ?? []) as Tables[T]['Row'][];
      rows.push(...page);
      if (page.length < PAGE_SIZE) return rows;
    }
  }

  async load(): Promise<Workspace> {
    const [players, evaluations, weights, lineups, starters, bench, trainings, participants, exercises, events, matches, sets, setStarters, rallies, rallyActions] = await Promise.all([
      this.fetchAll('players', ['created_at', 'id']),
      this.fetchAll('evaluations', ['created_at', 'id']),
      this.fetchAll('overall_weights', ['position']),
      this.fetchAll('lineups', ['created_at', 'id']),
      this.fetchAll('lineup_starters', ['lineup_id', 'slot']),
      this.fetchAll('lineup_bench', ['lineup_id', 'sort_order']),
      this.fetchAll('trainings', ['created_at', 'id']),
      this.fetchAll('training_participants', ['training_id', 'player_id']),
      this.fetchAll('training_exercises', ['training_id', 'sort_order', 'id']),
      this.fetchAll('training_events', ['recorded_at', 'id']),
      this.fetchAll('matches', ['created_at', 'id']),
      this.fetchAll('match_sets', ['match_id', 'number']),
      this.fetchAll('match_set_starters', ['match_id', 'set_number', 'slot']),
      this.fetchAll('rallies', ['match_id', 'set_number', 'seq', 'recorded_at', 'id']),
      this.fetchAll('rally_actions', ['recorded_at', 'id']),
    ]);

    const startersBySet = new Map<string, SetStarterRow[]>();
    for (const row of setStarters) {
      const setKey = `${row.match_id}\u0001${row.set_number}`;
      startersBySet.set(setKey, [...(startersBySet.get(setKey) ?? []), row]);
    }

    const group = <R extends { lineup_id?: string; training_id?: string }>(rows: R[], key: 'lineup_id' | 'training_id') => {
      const map = new Map<string, R[]>();
      for (const row of rows) {
        const id = row[key];
        if (id === undefined) continue;
        map.set(id, [...(map.get(id) ?? []), row]);
      }
      return map;
    };
    const startersBy = group<StarterRow>(starters, 'lineup_id');
    const benchBy = group<BenchRow>(bench, 'lineup_id');
    const participantsBy = group<ParticipantRow>(participants, 'training_id');

    return {
      players: players.map(playerFromRow),
      evaluations: evaluations.map(evaluationFromRow),
      lineups: lineups.map((row) => lineupFromRows(row, startersBy.get(row.id) ?? [], benchBy.get(row.id) ?? [])),
      settings: { weights: weightsFromRows(weights) },
      activity: null, // o resumo de partidas é só demonstração e não existe no banco
      trainings: trainings.map((row) =>
        trainingFromRows(row, (participantsBy.get(row.id) ?? []).map((p) => p.player_id)),
      ),
      exercises: exercises.map(exerciseFromRow),
      trainingEvents: events.map(eventFromRow),
      matches: matches.map(matchFromRow),
      matchSets: sets.map((row) => setFromRows(row, startersBySet.get(`${row.match_id}\u0001${row.number}`) ?? [])),
      rallies: rallies.map(rallyFromRow),
      rallyActions: rallyActions.map(rallyActionFromRow),
    };
  }

  /* ───────── elenco, avaliações, pesos ───────── */

  async savePlayer(player: Player): Promise<void> {
    check(await guard(() => this.client.from('players').upsert(playerToRow(this.teamId, player), { onConflict: 'team_id,id' })));
  }

  async addEvaluation(evaluation: Evaluation): Promise<void> {
    check(await guard(() => this.client.from('evaluations').insert(evaluationToRow(this.teamId, evaluation))));
  }

  async saveSettings(settings: Settings): Promise<void> {
    // Uma única requisição (uma instrução SQL): os cinco registros de pesos entram juntos ou nenhum entra.
    check(await guard(() => this.client.from('overall_weights').upsert(weightsToRows(this.teamId, settings.weights), { onConflict: 'team_id,position' })));
  }

  /* ───────── escalações ───────── */

  private async selectLineupParts(lineupId: string) {
    const [lineup, starters, bench] = await Promise.all([
      guard(() => this.client.from('lineups').select('*').eq('team_id', this.teamId).eq('id', lineupId)),
      guard(() => this.client.from('lineup_starters').select('*').eq('team_id', this.teamId).eq('lineup_id', lineupId)),
      guard(() => this.client.from('lineup_bench').select('*').eq('team_id', this.teamId).eq('lineup_id', lineupId)),
    ]);
    check(lineup);
    check(starters);
    check(bench);
    return { lineup: (lineup.data ?? []) as LineupRow[], starters: (starters.data ?? []) as StarterRow[], bench: (bench.data ?? []) as BenchRow[] };
  }

  private async replaceLineupParts(lineupId: string, starters: StarterRow[], bench: BenchRow[]) {
    // Apaga e reinsere: trocar dois titulares de lugar violaria "ninguém duas vezes" se fosse atualização linha a linha.
    check(await guard(() => this.client.from('lineup_starters').delete().eq('team_id', this.teamId).eq('lineup_id', lineupId)));
    check(await guard(() => this.client.from('lineup_bench').delete().eq('team_id', this.teamId).eq('lineup_id', lineupId)));
    if (starters.length > 0) check(await guard(() => this.client.from('lineup_starters').insert(starters)));
    if (bench.length > 0) check(await guard(() => this.client.from('lineup_bench').insert(bench)));
  }

  async saveLineup(lineup: Lineup): Promise<void> {
    const next = lineupToRows(this.teamId, lineup);
    const before = await this.selectLineupParts(lineup.id);
    check(await guard(() => this.client.from('lineups').upsert(next.lineup, { onConflict: 'team_id,id' })));
    try {
      await this.replaceLineupParts(lineup.id, next.starters, next.bench);
    } catch (failure) {
      // Sem transação entre tabelas: tenta devolver a escalação ao estado anterior para não deixá-la pela metade.
      try {
        const old = before.lineup[0];
        if (old) {
          check(await guard(() => this.client.from('lineups').upsert(old, { onConflict: 'team_id,id' })));
          await this.replaceLineupParts(lineup.id, before.starters, before.bench);
        } else {
          check(await guard(() => this.client.from('lineups').delete().eq('team_id', this.teamId).eq('id', lineup.id)));
        }
      } catch {
        throw new IntegrityError('Não foi possível salvar a escalação e ela pode ter ficado incompleta no servidor. Recarregue a página e confira antes de continuar.');
      }
      throw failure;
    }
  }

  async deleteLineup(lineupId: string): Promise<void> {
    await this.deleteRow('lineups', lineupId, 'Seu papel na equipe não permite excluir escalações.');
  }

  /**
   * Excluir sem permissão NÃO dá erro no banco: a RLS esconde a linha e nada é apagado. Para não tratar isso como
   * sucesso, confere se a linha ainda existe: se existe e nada foi apagado, foi recusado.
   */
  private async deleteRow(table: 'lineups' | 'trainings' | 'matches', id: string, denied: string): Promise<void> {
    const deleted = await guard(() => this.client.from(table).delete().eq('team_id', this.teamId).eq('id', id).select('id'));
    check(deleted);
    if ((deleted.data ?? []).length > 0) return;
    const remaining = await guard(() => this.client.from(table).select('id').eq('team_id', this.teamId).eq('id', id));
    check(remaining);
    if ((remaining.data ?? []).length > 0) throw new PermissionDeniedError(denied);
  }

  /* ───────── treinos ───────── */

  async saveTraining(training: Training, exercises: TrainingExercise[]): Promise<void> {
    if (exercises.some((e) => e.trainingId !== training.id)) throw new IntegrityError('Há exercício ligado a outro treino.');

    const [exerciseRows, participantsNow, eventsNow] = await Promise.all([
      guard(() => this.client.from('training_exercises').select('id').eq('team_id', this.teamId).eq('training_id', training.id)),
      guard(() => this.client.from('training_participants').select('player_id').eq('team_id', this.teamId).eq('training_id', training.id)),
      guard(() => this.client.from('training_events').select('exercise_id, player_id, voided_at').eq('team_id', this.teamId).eq('training_id', training.id)),
    ]);
    check(exerciseRows);
    check(participantsNow);
    check(eventsNow);

    // As mesmas regras do gateway local, conferidas ANTES de gravar qualquer coisa.
    const keptExercises = new Set(exercises.map((e) => e.id));
    const events = (eventsNow.data ?? []) as Pick<EventRow, 'exercise_id' | 'player_id' | 'voided_at'>[];
    if (events.some((e) => !keptExercises.has(e.exercise_id))) throw new IntegrityError('Não é possível remover um exercício que tem registros.');
    if (events.some((e) => e.voided_at === null && !training.participantIds.includes(e.player_id))) {
      throw new IntegrityError('Não é possível remover da lista um atleta que tem registros válidos.');
    }

    const currentExerciseIds = ((exerciseRows.data ?? []) as Pick<ExerciseRow, 'id'>[]).map((e) => e.id);
    const currentParticipantIds = ((participantsNow.data ?? []) as Pick<ParticipantRow, 'player_id'>[]).map((p) => p.player_id);
    const wantedParticipants = participantRows(this.teamId, training);

    // Ordem aditiva: o que entra primeiro, o que sai por último. Falhar no meio deixa um treino válido (com
    // itens a mais), nunca com registros órfãos; repetir o salvamento conclui o trabalho.
    check(await guard(() => this.client.from('trainings').upsert(trainingToRow(this.teamId, training), { onConflict: 'team_id,id' })));
    const toAdd = wantedParticipants.filter((p) => !currentParticipantIds.includes(p.player_id));
    if (toAdd.length > 0) check(await guard(() => this.client.from('training_participants').insert(toAdd)));
    if (exercises.length > 0) {
      check(await guard(() => this.client.from('training_exercises').upsert(exercises.map((e) => exerciseToRow(this.teamId, e)), { onConflict: 'team_id,id' })));
    }
    const dropExercises = currentExerciseIds.filter((id) => !keptExercises.has(id));
    if (dropExercises.length > 0) {
      check(await guard(() => this.client.from('training_exercises').delete().eq('team_id', this.teamId).eq('training_id', training.id).in('id', dropExercises)));
    }
    const dropParticipants = currentParticipantIds.filter((id) => !wantedParticipants.some((p) => p.player_id === id));
    if (dropParticipants.length > 0) {
      check(await guard(() => this.client.from('training_participants').delete().eq('team_id', this.teamId).eq('training_id', training.id).in('player_id', dropParticipants)));
    }
  }

  async deleteTraining(trainingId: string): Promise<void> {
    // Cascata no banco (exercícios, participantes e registros). Não há cópia de segurança remota: a interface
    // já confirma com as contagens, e só a comissão técnica (coach) tem permissão.
    await this.deleteRow('trainings', trainingId, 'Seu papel na equipe não permite excluir treinos.');
  }

  /* ───────── registros de treino ───────── */

  async addTrainingEvent(event: TrainingEvent): Promise<void> {
    // Idempotente por attempt_key no próprio banco (ON CONFLICT DO NOTHING): repetir o envio não duplica.
    check(
      await guard(() =>
        this.client.from('training_events').upsert(eventToRow(this.teamId, event), { onConflict: 'team_id,attempt_key', ignoreDuplicates: true }),
      ),
    );
  }

  async voidTrainingEvent(eventId: string, voidedAt: string): Promise<void> {
    const updated = await guard(() =>
      this.client
        .from('training_events')
        .update({ voided_at: voidedAt, voided_by: this.userId })
        .eq('team_id', this.teamId)
        .eq('id', eventId)
        .is('voided_at', null)
        .select('id'),
    );
    check(updated);
    if ((updated.data ?? []).length > 0) return;

    // Nenhuma linha mudou: o registro não existe, já estava anulado (ok, idempotente) ou a RLS bloqueou.
    const current = await guard(() => this.client.from('training_events').select('id, voided_at').eq('team_id', this.teamId).eq('id', eventId));
    check(current);
    const row = ((current.data ?? []) as Pick<EventRow, 'id' | 'voided_at'>[])[0];
    if (!row) throw new IntegrityError('O registro a desfazer não existe.');
    if (row.voided_at === null) throw new PermissionDeniedError('Seu papel na equipe não permite desfazer este registro.');
  }

  /* ───────── partidas ───────── */

  private async selectMatchRow(matchId: string): Promise<MatchRow | null> {
    const result = await guard(() => this.client.from('matches').select('*').eq('team_id', this.teamId).eq('id', matchId));
    check(result);
    return ((result.data ?? []) as MatchRow[])[0] ?? null;
  }

  private async requireMatch(matchId: string): Promise<Match> {
    const row = await this.selectMatchRow(matchId);
    if (!row) throw new IntegrityError('Esta partida não existe mais.');
    return matchFromRow(row);
  }

  async saveMatch(match: Match): Promise<Match> {
    const existing = await this.selectMatchRow(match.id);
    if (!existing) {
      check(await guard(() => this.client.from('matches').insert(matchToInsertRow(this.teamId, match))));
    } else {
      const updated = await guard(() => this.client.from('matches').update(matchToUpdateRow(match)).eq('team_id', this.teamId).eq('id', match.id).select('id'));
      check(updated);
      if ((updated.data ?? []).length === 0) throw new PermissionDeniedError('Seu papel na equipe não permite editar partidas.');
    }
    return this.requireMatch(match.id);
  }

  async deleteMatch(matchId: string): Promise<void> {
    await this.deleteRow('matches', matchId, 'Seu papel na equipe não permite excluir partidas.');
  }

  /** Chama uma função do banco (transação única) e traduz o erro. */
  private async call(name: 'start_set' | 'record_rally' | 'void_last_rally' | 'cancel_empty_set' | 'conclude_match' | 'reopen_match' | 'add_rally_action' | 'void_rally_action', args: Record<string, unknown>): Promise<unknown> {
    const result = await guard(() => this.client.rpc(name as never, args as never) as unknown as PromiseLike<PgResult & { data: unknown }>);
    check(result);
    return result.data;
  }

  async startSet(matchId: string, input: StartSetInput): Promise<{ set: MatchSet; match: Match }> {
    await this.call('start_set', {
      p_team: this.teamId,
      p_match: matchId,
      p_set: {
        number: input.number,
        first_server: input.firstServer,
        libero_id: input.liberoId,
        created_at: input.createdAt,
        starters: input.starters.map((s) => ({ slot: s.slot, player_id: s.playerId, role: s.role })),
      },
    });
    const [setResult, starterResult] = await Promise.all([
      guard(() => this.client.from('match_sets').select('*').eq('team_id', this.teamId).eq('match_id', matchId).eq('number', input.number)),
      guard(() => this.client.from('match_set_starters').select('*').eq('team_id', this.teamId).eq('match_id', matchId).eq('set_number', input.number)),
    ]);
    check(setResult);
    check(starterResult);
    const setRow = ((setResult.data ?? []) as SetRow[])[0];
    if (!setRow) throw new RemoteDataError('o set iniciado não foi encontrado');
    return { set: setFromRows(setRow, (starterResult.data ?? []) as SetStarterRow[]), match: await this.requireMatch(matchId) };
  }

  async recordRally(matchId: string, input: RallyInput): Promise<{ rally: Rally; actions: RallyAction[]; duplicate: boolean }> {
    const data = await this.call('record_rally', {
      p_team: this.teamId,
      p_match: matchId,
      p_rally: {
        id: input.id,
        attempt_key: input.attemptKey,
        set_number: input.setNumber,
        expected_seq: input.expectedSeq,
        winner: input.winner,
        reason: input.reason,
        player_id: input.playerId,
        recorded_at: input.recordedAt,
        actions: input.actions.map((a) => ({ id: a.id, attempt_key: a.attemptKey, player_id: a.playerId, fundamental: a.fundamental, outcome: a.outcome })),
      },
    });
    const body = jsonRow(data, ['duplicate', 'rally', 'actions'], 'ponto registrado');
    const rallyJson = jsonRow(body.rally, RALLY_KEYS, 'ponto registrado');
    if (!Array.isArray(body.actions)) throw new RemoteDataError('ponto registrado: ações inesperadas');
    return {
      rally: rallyFromRow(rallyJson as unknown as RallyRow),
      actions: body.actions.map((a) => rallyActionFromRow(jsonRow(a, ACTION_KEYS, 'ação técnica') as unknown as RallyActionRow)),
      duplicate: body.duplicate === true,
    };
  }

  /** `_voidedAt` existe só pelo contrato: o banco usa o próprio relógio para anular. */
  async voidLastRally(matchId: string, rallyId: string, _voidedAt?: string): Promise<void> {
    await this.call('void_last_rally', { p_team: this.teamId, p_match: matchId, p_rally: rallyId });
  }

  async cancelEmptySet(matchId: string, number: number): Promise<Match> {
    await this.call('cancel_empty_set', { p_team: this.teamId, p_match: matchId, p_number: number });
    return this.requireMatch(matchId);
  }

  async concludeMatch(matchId: string, _concludedAt?: string): Promise<Match> {
    await this.call('conclude_match', { p_team: this.teamId, p_match: matchId });
    return this.requireMatch(matchId);
  }

  async reopenMatch(matchId: string): Promise<Match> {
    await this.call('reopen_match', { p_team: this.teamId, p_match: matchId });
    return this.requireMatch(matchId);
  }

  async addRallyAction(input: ActionInput & { rallyId: string; recordedAt: string }): Promise<RallyAction> {
    const data = await this.call('add_rally_action', {
      p_team: this.teamId,
      p_action: {
        id: input.id,
        attempt_key: input.attemptKey,
        rally_id: input.rallyId,
        player_id: input.playerId,
        fundamental: input.fundamental,
        outcome: input.outcome,
        recorded_at: input.recordedAt,
      },
    });
    return rallyActionFromRow(jsonRow(data, ACTION_KEYS, 'ação técnica') as unknown as RallyActionRow);
  }

  async voidRallyAction(actionId: string, _voidedAt?: string): Promise<void> {
    await this.call('void_rally_action', { p_team: this.teamId, p_action: actionId });
  }

  /* ───────── fotos dos atletas (bucket privado `player-photos`) ───────── */

  async uploadPlayerPhoto(playerId: string, image: Blob): Promise<string> {
    const path = photoPath(this.teamId, playerId, Date.now());
    const result = await guard(() => this.client.storage.from(PHOTO_BUCKET).upload(path, image, { contentType: image.type || 'image/jpeg', upsert: false }));
    if (result.error) throw mapStorageError(result.error);
    return path;
  }

  async removePlayerPhoto(reference: string): Promise<void> {
    // Melhor esforço: o arquivo antigo órfão é só espaço ocupado; a referência do atleta já foi trocada.
    try {
      await this.client.storage.from(PHOTO_BUCKET).remove([reference]);
    } catch {
      /* sem conexão ou sem permissão: o arquivo fica, sem prejuízo */
    }
  }

  async photoUrl(reference: string): Promise<string> {
    const result = await guard(() => this.client.storage.from(PHOTO_BUCKET).createSignedUrl(reference, PHOTO_URL_SECONDS));
    if (result.error || !result.data?.signedUrl) throw result.error ? mapStorageError(result.error) : new RemoteDataError('a foto não pôde ser lida');
    return result.data.signedUrl;
  }

  /* ───────── recursos que só existem com dados locais ───────── */

  async replaceWorkspace(): Promise<void> {
    throw new RemoteOperationUnavailableError('Substituir o workspace inteiro');
  }

  async snapshotInfo(): Promise<SnapshotInfo | null> {
    return null;
  }

  async restoreSnapshot(): Promise<void> {
    throw new RemoteOperationUnavailableError('Desfazer a última substituição');
  }

  async exportRaw(): Promise<string | null> {
    return null;
  }

  async recoveryCopies(): Promise<RawCopy[]> {
    return [];
  }

  subscribe(): () => void {
    return () => {};
  }

  async usage(): Promise<StorageUsage | null> {
    return null;
  }
}
