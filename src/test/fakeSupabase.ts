/**
 * Cliente Supabase SIMULADO para testes (autenticação e consultas), sem rede e sem conta real.
 *
 * ATENÇÃO: isto é uma simulação do que o aplicativo enxerga. Reproduz restrições do esquema real (chaves,
 * unicidade, cascatas, os nomes das restrições e os códigos de erro do PostgREST) para exercitar o código do
 * Alpha7, e imita, de forma simplificada, o formato das respostas da RLS (insert recusado com 42501, update e
 * delete sem efeito, leitura filtrada por equipe). NÃO É PROVA de que as políticas RLS reais funcionam: isso é
 * coberto por supabase/tests/rls.test.sql, executado no banco de verdade (e desfeito no final).
 */
import type { AlphaSupabaseClient } from '@/data/supabase/client';

type Row = Record<string, unknown>;
type Role = 'coach' | 'analyst' | 'viewer';

interface ForeignKey {
  name: string;
  cols: string[];
  ref: string;
  refCols: string[];
  cascade: boolean;
}
interface TableDef {
  pk: string[];
  unique: { name: string; cols: string[] }[];
  fks: ForeignKey[];
  /** Quem pode escrever (espelha as políticas do banco, de forma simplificada). */
  writers: Role[];
  /** Quem pode excluir, quando difere de quem escreve. */
  deleters?: Role[];
}

const T = 'team_id';
export const TABLES: Record<string, TableDef> = {
  teams: { pk: ['id'], unique: [], fks: [], writers: [] },
  team_members: { pk: [T, 'user_id'], unique: [], fks: [], writers: ['coach'] },
  players: {
    pk: [T, 'id'],
    unique: [{ name: 'players_team_id_jersey_number_key', cols: [T, 'jersey_number'] }],
    fks: [],
    writers: ['coach'],
  },
  evaluations: {
    pk: [T, 'id'],
    unique: [],
    fks: [{ name: 'evaluations_team_id_player_id_fkey', cols: [T, 'player_id'], ref: 'players', refCols: [T, 'id'], cascade: true }],
    writers: ['coach', 'analyst'],
  },
  overall_weights: { pk: [T, 'position'], unique: [], fks: [], writers: ['coach'] },
  lineups: {
    pk: [T, 'id'],
    unique: [],
    fks: [{ name: 'lineups_team_id_libero_id_fkey', cols: [T, 'libero_id'], ref: 'players', refCols: [T, 'id'], cascade: false }],
    writers: ['coach'],
  },
  lineup_starters: {
    pk: [T, 'lineup_id', 'slot'],
    unique: [{ name: 'lineup_starters_team_id_lineup_id_player_id_key', cols: [T, 'lineup_id', 'player_id'] }],
    fks: [
      { name: 'lineup_starters_team_id_lineup_id_fkey', cols: [T, 'lineup_id'], ref: 'lineups', refCols: [T, 'id'], cascade: true },
      { name: 'lineup_starters_team_id_player_id_fkey', cols: [T, 'player_id'], ref: 'players', refCols: [T, 'id'], cascade: false },
    ],
    writers: ['coach'],
  },
  lineup_bench: {
    pk: [T, 'lineup_id', 'sort_order'],
    unique: [{ name: 'lineup_bench_team_id_lineup_id_player_id_key', cols: [T, 'lineup_id', 'player_id'] }],
    fks: [
      { name: 'lineup_bench_team_id_lineup_id_fkey', cols: [T, 'lineup_id'], ref: 'lineups', refCols: [T, 'id'], cascade: true },
      { name: 'lineup_bench_team_id_player_id_fkey', cols: [T, 'player_id'], ref: 'players', refCols: [T, 'id'], cascade: false },
    ],
    writers: ['coach'],
  },
  trainings: { pk: [T, 'id'], unique: [], fks: [], writers: ['coach', 'analyst'], deleters: ['coach'] },
  training_participants: {
    pk: [T, 'training_id', 'player_id'],
    unique: [],
    fks: [
      { name: 'training_participants_team_id_training_id_fkey', cols: [T, 'training_id'], ref: 'trainings', refCols: [T, 'id'], cascade: true },
      { name: 'training_participants_team_id_player_id_fkey', cols: [T, 'player_id'], ref: 'players', refCols: [T, 'id'], cascade: false },
    ],
    writers: ['coach', 'analyst'],
  },
  training_exercises: {
    pk: [T, 'id'],
    unique: [],
    fks: [{ name: 'training_exercises_team_id_training_id_fkey', cols: [T, 'training_id'], ref: 'trainings', refCols: [T, 'id'], cascade: true }],
    writers: ['coach', 'analyst'],
  },
  training_events: {
    pk: [T, 'id'],
    unique: [{ name: 'training_events_team_id_attempt_key_key', cols: [T, 'attempt_key'] }],
    fks: [
      { name: 'training_events_team_id_training_id_fkey', cols: [T, 'training_id'], ref: 'trainings', refCols: [T, 'id'], cascade: true },
      { name: 'training_events_team_id_exercise_id_training_id_fkey', cols: [T, 'exercise_id', 'training_id'], ref: 'training_exercises', refCols: [T, 'id', 'training_id'], cascade: false },
      { name: 'training_events_team_id_player_id_fkey', cols: [T, 'player_id'], ref: 'players', refCols: [T, 'id'], cascade: false },
    ],
    writers: ['coach', 'analyst'],
  },
};

const OUTCOMES: Record<string, string[]> = {
  saque: ['ace', 'valido', 'erro'],
  recepcao: ['A', 'B', 'C', 'erro'],
  levantamento: ['excelente', 'atacavel', 'quebrado', 'erro'],
  ataque: ['ponto', 'erro', 'bloqueado', 'outra'],
  bloqueio: ['ponto', 'sem_ponto', 'erro'],
  defesa: ['positiva', 'recuperada', 'erro'],
};

interface PgError {
  code: string;
  message: string;
  details: string;
  hint: string;
}
interface Result {
  data: unknown;
  error: PgError | null;
  status: number;
}

const pgError = (code: string, message: string): PgError => ({ code, message, details: '', hint: '' });
class Abort extends Error {
  constructor(readonly pg: PgError) {
    super(pg.message);
  }
}

const same = (a: unknown, b: unknown) => a === b;
const key = (row: Row, cols: string[]) => cols.map((c) => String(row[c] ?? '\u0000')).join('\u0001');
const MAX_ROWS = 1000; // o PostgREST corta aqui, em silêncio, se a consulta não pedir páginas

export interface FakeAuthUser {
  id: string;
  email: string;
  password: string;
}
export interface FakeSession {
  user: { id: string; email: string };
}
type AuthEvent = 'INITIAL_SESSION' | 'SIGNED_IN' | 'SIGNED_OUT' | 'TOKEN_REFRESHED' | 'USER_UPDATED' | 'PASSWORD_RECOVERY';
type AuthListener = (event: AuthEvent, session: FakeSession | null) => void;

export interface FakeSupabaseOptions {
  users?: FakeAuthUser[];
}

export class FakeSupabase {
  db: Record<string, Row[]> = Object.fromEntries(Object.keys(TABLES).map((name) => [name, []]));
  users: FakeAuthUser[];
  session: FakeSession | null = null;
  offline = false;
  expired = false;
  /** Cada consulta feita: tabela, operação e filtros de igualdade (para provar que tudo é restrito à equipe). */
  calls: { table: string; op: string; eq: Record<string, unknown> }[] = [];
  rpcCalls: { name: string; args: unknown }[] = [];
  passwordResets: { email: string; redirectTo: string | undefined }[] = [];
  updatedPasswords: string[] = [];
  signOutCalls = 0;
  /** Erro que o próximo método de autenticação deve devolver (uma vez). */
  authFailure: { message: string; status?: number; code?: string; name?: string } | null = null;
  rpcFailure: PgError | null = null;
  private listeners = new Set<AuthListener>();
  private idCounter = 0;

  constructor(options: FakeSupabaseOptions = {}) {
    this.users = options.users ?? [];
  }

  /** O cliente tipado que o aplicativo recebe. */
  get client(): AlphaSupabaseClient {
    // A forma do objeto basta para o que o app usa (from, rpc, auth); o tipo completo do supabase-js não é reproduzido.
    return this as unknown as AlphaSupabaseClient;
  }

  /* ───────── dados ───────── */
  seed(table: string, rows: Row[]) {
    this.db[table] = [...(this.db[table] ?? []), ...rows.map((r) => ({ ...r }))];
    return this;
  }
  rows(table: string, teamId?: string): Row[] {
    return (this.db[table] ?? []).filter((r) => teamId === undefined || r[T] === teamId || (table === 'teams' && r.id === teamId));
  }
  private role(teamId: unknown): Role | null {
    const uid = this.session?.user.id;
    const row = this.db.team_members?.find((m) => m.user_id === uid && m.team_id === teamId);
    return (row?.role as Role | undefined) ?? null;
  }
  private teamOf(table: string, row: Row): unknown {
    return table === 'teams' ? row.id : row[T];
  }

  from(table: string) {
    return new Query(this, table);
  }

  /* ───────── funções ───────── */
  async rpc(name: string, args: Row = {}): Promise<Result> {
    this.rpcCalls.push({ name, args });
    if (this.offline) return { data: null, error: pgError('', 'TypeError: Failed to fetch'), status: 0 };
    if (this.rpcFailure) {
      const error = this.rpcFailure;
      this.rpcFailure = null;
      return { data: null, error, status: 400 };
    }
    const uid = this.session?.user.id;
    if (name === 'create_team') {
      if (!uid) return { data: null, error: pgError('28000', 'Entre com seu e-mail para criar uma equipe.'), status: 400 };
      const id = `team-${++this.idCounter}`;
      this.db.teams?.push({ id, name: String(args.p_name), created_at: new Date().toISOString() });
      this.db.team_members?.push({ team_id: id, user_id: uid, role: 'coach', created_at: new Date().toISOString() });
      return { data: id, error: null, status: 200 };
    }
    if (name === 'add_team_member') {
      const team = String(args.p_team);
      if (this.role(team) !== 'coach') return { data: null, error: pgError('42501', 'Só a comissão técnica (coach) pode adicionar pessoas à equipe.'), status: 403 };
      if (!['coach', 'analyst', 'viewer'].includes(String(args.p_role))) return { data: null, error: pgError('22023', 'Papel inválido: use coach, analyst ou viewer.'), status: 400 };
      const target = this.users.find((u) => u.email.toLowerCase() === String(args.p_email).trim().toLowerCase());
      if (!target) return { data: null, error: pgError('P0002', 'Essa pessoa ainda não entrou no Alpha7.'), status: 400 };
      const rows = this.db.team_members ?? [];
      const existing = rows.find((m) => m.team_id === team && m.user_id === target.id);
      if (existing) existing.role = String(args.p_role);
      else rows.push({ team_id: team, user_id: target.id, role: String(args.p_role), created_at: new Date().toISOString() });
      return { data: null, error: null, status: 200 };
    }
    return { data: null, error: pgError('PGRST202', `Could not find the function public.${name}`), status: 404 };
  }

  /* ───────── autenticação ───────── */
  readonly auth = {
    getSession: async () => ({ data: { session: this.session }, error: null }),
    onAuthStateChange: (listener: AuthListener) => {
      this.listeners.add(listener);
      queueMicrotask(() => {
        if (this.listeners.has(listener)) listener('INITIAL_SESSION', this.session);
      });
      return { data: { subscription: { unsubscribe: () => void this.listeners.delete(listener) } } };
    },
    signInWithPassword: async (credentials: { email: string; password: string }) => {
      if (this.authFailure) return this.takeAuthFailure();
      if (this.offline) return { data: { session: null, user: null }, error: { message: 'Failed to fetch', status: 0, name: 'AuthRetryableFetchError' } };
      const user = this.users.find((u) => u.email.toLowerCase() === credentials.email.toLowerCase() && u.password === credentials.password);
      if (!user) {
        return { data: { session: null, user: null }, error: { message: 'Invalid login credentials', status: 400, code: 'invalid_credentials', name: 'AuthApiError' } };
      }
      this.session = { user: { id: user.id, email: user.email } };
      this.emit('SIGNED_IN', this.session);
      return { data: { session: this.session, user: this.session.user }, error: null };
    },
    signOut: async () => {
      this.signOutCalls += 1;
      this.session = null;
      this.emit('SIGNED_OUT', null);
      return { error: null };
    },
    resetPasswordForEmail: async (email: string, options?: { redirectTo?: string }) => {
      this.passwordResets.push({ email, redirectTo: options?.redirectTo });
      if (this.authFailure) return { ...this.takeAuthFailure() };
      return { data: {}, error: null };
    },
    updateUser: async (attributes: { password?: string }) => {
      if (this.authFailure) return { ...this.takeAuthFailure() };
      if (!this.session) return { data: { user: null }, error: { message: 'Auth session missing!', status: 400, code: 'session_not_found', name: 'AuthSessionMissingError' } };
      if ((attributes.password ?? '').length < 6) {
        return { data: { user: null }, error: { message: 'Password should be at least 6 characters.', status: 422, code: 'weak_password', name: 'AuthWeakPasswordError' } };
      }
      this.updatedPasswords.push(attributes.password ?? '');
      this.emit('USER_UPDATED', this.session);
      return { data: { user: this.session.user }, error: null };
    },
  };

  private takeAuthFailure() {
    const error = this.authFailure;
    this.authFailure = null;
    return { data: { session: null, user: null }, error };
  }

  /** Entra diretamente (sem evento), para montar um cenário já autenticado. */
  signInAs(userId: string) {
    const user = this.users.find((u) => u.id === userId);
    if (!user) throw new Error(`usuário ${userId} não existe no teste`);
    this.session = { user: { id: user.id, email: user.email } };
    return this;
  }
  emit(event: AuthEvent, session: FakeSession | null) {
    for (const listener of [...this.listeners]) listener(event, session);
  }
  /** A sessão acaba sem a pessoa pedir (token vencido e não renovado). */
  expireSession() {
    this.session = null;
    this.emit('SIGNED_OUT', null);
  }
  /** A pessoa abriu o link de redefinição de senha. */
  startRecovery(userId: string) {
    this.signInAs(userId);
    this.emit('PASSWORD_RECOVERY', this.session);
  }

  /* ───────── motor das consultas ───────── */
  /** @internal */
  execute(q: Query): Result {
    this.calls.push({ table: q.table, op: q.op, eq: { ...q.eqs } });
    if (this.offline) return { data: null, error: pgError('', 'TypeError: Failed to fetch'), status: 0 };
    if (this.expired) return { data: null, error: pgError('PGRST301', 'JWT expired'), status: 401 };
    const def = TABLES[q.table];
    if (!def) return { data: null, error: pgError('42P01', `relation "${q.table}" does not exist`), status: 404 };

    const snapshot = structuredClone(this.db);
    try {
      return this.run(q, def);
    } catch (error) {
      this.db = snapshot; // instrução SQL é tudo ou nada
      this.pendingRestrict = [];
      this.depth = 0;
      if (error instanceof Abort) return { data: null, error: error.pg, status: error.pg.code === '42501' ? 403 : 409 };
      throw error;
    }
  }

  private matches(q: Query, row: Row): boolean {
    return q.filters.every((f) => f(row));
  }

  private run(q: Query, def: TableDef): Result {
    const table = this.db[q.table] ?? [];
    if (q.op === 'select') {
      let rows = table.filter((r) => this.matches(q, r) && this.role(this.teamOf(q.table, r)) !== null);
      for (const { column, ascending } of [...q.orders].reverse()) {
        rows = [...rows].sort((a, b) => compare(a[column], b[column]) * (ascending ? 1 : -1));
      }
      // Ordem total: para o teste de paginação, o desempate pelas colunas pedidas já define a ordem.
      const from = q.rangeFrom ?? 0;
      const size = q.rangeTo === null ? MAX_ROWS : Math.min(q.rangeTo - from + 1, MAX_ROWS);
      return { data: rows.slice(from, from + size).map((r) => project(r, q.columns)), error: null, status: 200 };
    }

    const payload = q.payload;
    if (q.op === 'insert' || q.op === 'upsert') {
      const incoming = (Array.isArray(payload) ? payload : [payload]).map((r) => ({ ...(r as Row) }));
      const out: Row[] = [];
      for (const raw of incoming) {
        this.requireWrite(def, q.table, raw, 'insert');
        const target = q.onConflict ?? def.pk;
        const existing = q.op === 'upsert' ? table.find((r) => key(r, target) === key(raw, target)) : undefined;
        if (existing) {
          if (q.ignoreDuplicates) continue;
          this.requireWrite(def, q.table, existing, 'update');
          this.guardUpdate(q.table, existing, raw);
          Object.assign(existing, raw);
          this.checkRow(q.table, def, existing, existing);
          out.push(existing);
          continue;
        }
        this.checkRow(q.table, def, raw, null);
        table.push(raw);
        out.push(raw);
      }
      return { data: q.returning ? out.map((r) => project(r, q.columns)) : null, error: null, status: 201 };
    }

    const targets = table.filter((r) => this.matches(q, r) && this.role(this.teamOf(q.table, r)) !== null);
    if (q.op === 'update') {
      const changed: Row[] = [];
      for (const row of targets) {
        if (!this.canWrite(def, q.table, row)) continue; // RLS: a linha "não existe" para quem não pode escrever
        this.guardUpdate(q.table, row, q.payload as Row);
        Object.assign(row, q.payload as Row);
        this.checkRow(q.table, def, row, row);
        changed.push(row);
      }
      return { data: q.returning ? changed.map((r) => project(r, q.columns)) : null, error: null, status: 200 };
    }

    // delete
    const removable = targets.filter((r) => this.canWrite(def, q.table, r, 'delete'));
    this.remove(q.table, removable);
    return { data: q.returning ? removable.map((r) => project(r, q.columns)) : null, error: null, status: 200 };
  }

  private canWrite(def: TableDef, table: string, row: Row, op: 'write' | 'delete' = 'write'): boolean {
    const role = this.role(this.teamOf(table, row));
    return role !== null && (op === 'delete' ? (def.deleters ?? def.writers) : def.writers).includes(role);
  }
  private requireWrite(def: TableDef, table: string, row: Row, _op: string) {
    if (!this.canWrite(def, table, row)) {
      throw new Abort(pgError('42501', `new row violates row-level security policy for table "${table}"`));
    }
  }

  /** Regras de "só acrescenta" e "só anula" do banco. */
  private guardUpdate(table: string, current: Row, next: Row) {
    if (table === 'evaluations') throw new Abort(pgError('23514', 'Avaliações não podem ser editadas: registre uma nova avaliação.'));
    if (table === 'training_events') {
      for (const column of Object.keys(next)) {
        if (column !== 'voided_at' && column !== 'voided_by' && !same(current[column], next[column])) {
          throw new Abort(pgError('42501', 'permission denied for table training_events'));
        }
      }
      if (current.voided_at !== null && current.voided_at !== undefined && next.voided_at !== current.voided_at && 'voided_at' in next) {
        throw new Abort(pgError('23514', 'Um registro anulado não pode ser reativado nem ter a anulação alterada.'));
      }
    }
  }

  private checkRow(table: string, def: TableDef, row: Row, self: Row | null) {
    const others = (this.db[table] ?? []).filter((r) => r !== self && r !== row);
    if (others.some((r) => key(r, def.pk) === key(row, def.pk))) {
      throw new Abort(pgError('23505', `duplicate key value violates unique constraint "${table}_pkey"`));
    }
    for (const u of def.unique) {
      if (others.some((r) => key(r, u.cols) === key(row, u.cols))) {
        throw new Abort(pgError('23505', `duplicate key value violates unique constraint "${u.name}"`));
      }
    }
    for (const fk of def.fks) {
      if (fk.cols.some((c) => row[c] === null || row[c] === undefined)) continue;
      const found = (this.db[fk.ref] ?? []).some((r) => key(r, fk.refCols) === key(row, fk.cols));
      if (!found) {
        throw new Abort(pgError('23503', `insert or update on table "${table}" violates foreign key constraint "${fk.name}"`));
      }
    }
    if (table === 'training_events') {
      const allowed = OUTCOMES[String(row.fundamental)];
      if (!allowed?.includes(String(row.outcome))) {
        throw new Abort(pgError('23514', 'new row for relation "training_events" violates check constraint "training_events_check"'));
      }
      const isParticipant = (this.db.training_participants ?? []).some(
        (p) => p[T] === row[T] && p.training_id === row.training_id && p.player_id === row.player_id,
      );
      if ((row.voided_at === null || row.voided_at === undefined) && !isParticipant) {
        throw new Abort(pgError('23514', 'O atleta deste registro não participa do treino.'));
      }
    }
  }

  /** Exclusão com cascata (linhas dependentes) e recusa (linhas que ainda dependem de outras). */
  private remove(table: string, rows: Row[]) {
    if (rows.length === 0) return;
    this.depth += 1;
    try {
      const set = new Set(rows);
      this.db[table] = (this.db[table] ?? []).filter((r) => !set.has(r));
      for (const [childName, childDef] of Object.entries(TABLES)) {
        for (const fk of childDef.fks.filter((f) => f.ref === table)) {
          const children = (this.db[childName] ?? []).filter((c) => rows.some((p) => key(p, fk.refCols) === key(c, fk.cols)));
          if (children.length === 0) continue;
          if (fk.cascade) this.remove(childName, children);
          else {
            // NO ACTION: só vale se, ao fim da instrução, ainda restar dependente (a cascata pode ter levado junto).
            this.pendingRestrict.push({ childName, fk, children, table });
          }
        }
      }
    } finally {
      this.depth -= 1;
    }
    if (this.depth === 0) this.flushRestrict();
  }
  private pendingRestrict: { childName: string; fk: ForeignKey; children: Row[]; table: string }[] = [];
  private depth = 0;
  private flushRestrict() {
    const pending = this.pendingRestrict;
    this.pendingRestrict = [];
    for (const item of pending) {
      const stillThere = item.children.some((c) => (this.db[item.childName] ?? []).includes(c));
      if (stillThere) {
        throw new Abort(
          pgError('23503', `update or delete on table "${item.table}" violates foreign key constraint "${item.fk.name}" on table "${item.childName}"`),
        );
      }
    }
  }
}

const compare = (a: unknown, b: unknown): number => {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  const x = String(a ?? '');
  const y = String(b ?? '');
  return x < y ? -1 : x > y ? 1 : 0;
};

function project(row: Row, columns: string | null): Row {
  if (!columns || columns === '*') return structuredClone(row);
  const wanted = columns.split(',').map((c) => c.trim());
  return Object.fromEntries(wanted.map((c) => [c, structuredClone(row[c])]));
}

class Query implements PromiseLike<Result> {
  op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  payload: unknown = null;
  columns: string | null = '*';
  filters: ((row: Row) => boolean)[] = [];
  eqs: Record<string, unknown> = {};
  orders: { column: string; ascending: boolean }[] = [];
  rangeFrom: number | null = null;
  rangeTo: number | null = null;
  returning = false;
  onConflict: string[] | null = null;
  ignoreDuplicates = false;

  constructor(
    private readonly fake: FakeSupabase,
    readonly table: string,
  ) {}

  select(columns = '*') {
    if (this.op === 'select') this.columns = columns;
    else {
      this.returning = true;
      this.columns = columns;
    }
    return this;
  }
  insert(rows: unknown) {
    this.op = 'insert';
    this.payload = rows;
    return this;
  }
  upsert(rows: unknown, options: { onConflict?: string; ignoreDuplicates?: boolean } = {}) {
    this.op = 'upsert';
    this.payload = rows;
    this.onConflict = options.onConflict ? options.onConflict.split(',').map((c) => c.trim()) : null;
    this.ignoreDuplicates = options.ignoreDuplicates ?? false;
    return this;
  }
  update(values: unknown) {
    this.op = 'update';
    this.payload = values;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }
  eq(column: string, value: unknown) {
    this.eqs[column] = value;
    this.filters.push((r) => r[column] === value);
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push((r) => values.includes(r[column]));
    return this;
  }
  is(column: string, value: null) {
    this.filters.push((r) => (r[column] ?? null) === value);
    return this;
  }
  order(column: string, options: { ascending?: boolean } = {}) {
    this.orders.push({ column, ascending: options.ascending ?? true });
    return this;
  }
  range(from: number, to: number) {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  then<A = Result, B = never>(onfulfilled?: ((value: Result) => A | PromiseLike<A>) | null, onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null): PromiseLike<A | B> {
    return Promise.resolve().then(() => this.fake.execute(this)).then(onfulfilled, onrejected);
  }
}
