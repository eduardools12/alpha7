/**
 * Papéis da equipe e o que cada um pode fazer NA INTERFACE.
 *
 * A matriz espelha as políticas RLS reais do banco (supabase/migrations/…_rls_and_rpc.sql). Ela só serve
 * para esconder ou desabilitar o que o banco recusaria de qualquer jeito: a segurança efetiva é a RLS do
 * PostgreSQL, nunca este arquivo. Se o banco mudar, mude aqui junto (e o teste supabase/tests/rls.test.sql).
 */
export const ROLES = ['coach', 'analyst', 'viewer'] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  coach: 'Comissão técnica',
  analyst: 'Analista',
  viewer: 'Somente leitura',
};

export const CAPABILITIES = [
  'players:write',
  'evaluations:add',
  'weights:write',
  'lineups:write',
  'trainings:write',
  'trainings:delete',
  'events:record',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

/** Frase usada em mensagens: "Seu papel não permite {frase}". */
export const CAPABILITY_LABEL: Record<Capability, string> = {
  'players:write': 'cadastrar ou editar atletas',
  'evaluations:add': 'registrar avaliações',
  'weights:write': 'alterar os pesos do Overall',
  'lineups:write': 'criar, editar ou excluir escalações',
  'trainings:write': 'criar ou editar treinos',
  'trainings:delete': 'excluir treinos',
  'events:record': 'registrar ou desfazer tentativas de treino',
};

const ALLOWED: Record<Capability, readonly Role[]> = {
  'players:write': ['coach'],
  'evaluations:add': ['coach', 'analyst'],
  'weights:write': ['coach'],
  'lineups:write': ['coach'],
  'trainings:write': ['coach', 'analyst'],
  'trainings:delete': ['coach'],
  'events:record': ['coach', 'analyst'],
};

export const roleCan = (role: Role, capability: Capability): boolean => ALLOWED[capability].includes(role);

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && (ROLES as readonly string[]).includes(value);
