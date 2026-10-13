import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { TABLES } from '@/test/fakeSupabase';
import { CAPABILITIES, isRole, roleCan, type Capability, type Role } from './permissions';

describe('matriz de papéis da interface', () => {
  it('coach pode tudo', () => {
    for (const capability of CAPABILITIES) expect(roleCan('coach', capability)).toBe(true);
  });

  it('analyst registra (avaliações, treinos, tentativas), mas não mexe em elenco, pesos, escalações nem exclui treino', () => {
    const allowed = CAPABILITIES.filter((c) => roleCan('analyst', c));
    expect(allowed.sort()).toEqual(['evaluations:add', 'events:record', 'matches:write', 'trainings:write']);
  });

  it('viewer não pode nada que escreva', () => {
    for (const capability of CAPABILITIES) expect(roleCan('viewer', capability)).toBe(false);
  });

  it('papel desconhecido não é aceito (menor privilégio)', () => {
    expect(isRole('admin')).toBe(false);
    expect(isRole(undefined)).toBe(false);
    expect(isRole('coach')).toBe(true);
  });
});

/**
 * Guarda contra divergência: a matriz da interface e o simulador dos testes precisam coincidir com as políticas
 * RLS reais escritas na migração. Isto lê o ARQUIVO SQL (não executa o banco): quem executa e prova as políticas é
 * supabase/tests/rls.test.sql. Se mudar a migração, este teste lembra de atualizar a interface.
 */
describe('a interface espelha as políticas do arquivo de migração', () => {
  const matchesSql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261013134608_matches.sql'), 'utf8');
  const sql = `${readFileSync(resolve(__dirname, '../../supabase/migrations/20261013101642_rls_and_rpc.sql'), 'utf8')}\n${matchesSql}`;
  const policy = /create policy (\w+) on public\.(\w+) for (select|insert|update|delete) to authenticated\s+(?:using|with check) \(private\.(\w+)\(/g;
  const rolesOf = (fn: string): Role[] => (fn === 'is_coach' ? ['coach'] : fn === 'can_record' ? ['coach', 'analyst'] : ['coach', 'analyst', 'viewer']);
  const rules = new Map<string, Role[]>(); // "tabela:operação" → papéis
  for (const match of sql.matchAll(policy)) rules.set(`${match[2]}:${match[3]}`, rolesOf(match[4] ?? ''));

  it('o arquivo foi lido e tem as políticas esperadas', () => {
    expect(rules.size).toBeGreaterThanOrEqual(40);
    expect(rules.get('players:insert')).toEqual(['coach']);
  });

  const capabilityPolicies: Record<Capability, string[]> = {
    'players:write': ['players:insert', 'players:update'],
    'evaluations:add': ['evaluations:insert'],
    'weights:write': ['overall_weights:insert', 'overall_weights:update'],
    'lineups:write': ['lineups:insert', 'lineups:update', 'lineups:delete', 'lineup_starters:insert', 'lineup_bench:insert'],
    'trainings:write': ['trainings:insert', 'trainings:update', 'training_participants:insert', 'training_exercises:insert'],
    'trainings:delete': ['trainings:delete'],
    'events:record': ['training_events:insert', 'training_events:update'],
    'matches:write': ['matches:insert', 'matches:update'],
    'matches:delete': ['matches:delete'],
    // Funções (reopen_match) e a restrição da arte não são políticas de tabela: conferidas nos testes abaixo.
    'matches:reopen': [],
    'arts:generate': [],
  };

  for (const capability of CAPABILITIES) {
    it(`${capability}: papéis da interface = papéis da política`, () => {
      for (const key of capabilityPolicies[capability]) {
        const fromSql = rules.get(key);
        expect(fromSql, `política ${key} não encontrada no SQL`).toBeDefined();
        const fromUi = (['coach', 'analyst', 'viewer'] as const).filter((role) => roleCan(role, capability));
        expect([...(fromSql ?? [])].sort(), key).toEqual([...fromUi].sort());
      }
    });
  }

  it('as funções de partida do SQL conferem o papel por dentro, igual à matriz da interface', () => {
    const bodies = new Map<string, string>();
    for (const part of matchesSql.split('create function public.').slice(1)) bodies.set(part.slice(0, part.indexOf('(')), part);
    const recorders = ['start_set', 'record_rally', 'void_last_rally', 'cancel_empty_set', 'conclude_match', 'add_rally_action', 'void_rally_action'];
    for (const name of recorders) {
      expect(bodies.get(name), name).toContain('private.can_record(p_team)');
      expect(roleCan('analyst', 'matches:write')).toBe(true);
    }
    expect(bodies.get('reopen_match')).toContain('private.is_coach(p_team)');
    expect(roleCan('analyst', 'matches:reopen')).toBe(false);
    expect(roleCan('coach', 'matches:reopen')).toBe(true);
  });

  it('sets, titulares, rallies e ações técnicas não têm política de escrita: só as funções gravam', () => {
    for (const table of ['match_sets', 'match_set_starters', 'rallies', 'rally_actions']) {
      for (const op of ['insert', 'update', 'delete']) expect(rules.has(`${table}:${op}`), `${table}:${op}`).toBe(false);
      expect(rules.get(`${table}:select`), table).toEqual(['coach', 'analyst', 'viewer']);
    }
    expect(matchesSql).toMatch(/revoke all on table public\.matches, public\.match_sets, public\.match_set_starters, public\.rallies, public\.rally_actions\s+from anon, public, authenticated;/);
    // Status e resultado da partida não estão entre as colunas gravadas direto.
    const grants = matchesSql.match(/grant (?:insert|update) \(([^)]*)\)\s+on public\.matches/g) ?? [];
    expect(grants).toHaveLength(2);
    for (const grant of grants) expect(grant).not.toMatch(/\b(status|final_sets_us|final_sets_them|concluded_at)\b/);
  });

  it('o simulador de testes escreve nas mesmas tabelas que as políticas permitem', () => {
    for (const [table, def] of Object.entries(TABLES)) {
      if (table === 'teams') continue;
      const insert = rules.get(`${table}:insert`);
      expect([...(insert ?? [])].sort(), `${table} (inserção)`).toEqual([...def.writers].sort());
      const del = rules.get(`${table}:delete`);
      if (del) expect([...del].sort(), `${table} (exclusão)`).toEqual([...(def.deleters ?? def.writers)].sort());
    }
  });
});
