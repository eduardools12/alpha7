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
    expect(allowed.sort()).toEqual(['evaluations:add', 'events:record', 'trainings:write']);
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
  const sql = readFileSync(resolve(__dirname, '../../supabase/migrations/20261013101642_rls_and_rpc.sql'), 'utf8');
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
