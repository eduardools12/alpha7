import type { Role } from '@/auth/permissions';
import { createEmptyWorkspace } from '@/data/demo';
import { SupabaseGateway } from '@/data/supabase/SupabaseGateway';
import {
  evaluationToRow,
  eventToRow,
  exerciseToRow,
  lineupToRows,
  participantRows,
  playerToRow,
  trainingToRow,
  weightsToRows,
} from '@/data/supabase/mappers';
import type { Workspace } from '@/data/types';
import { matchTableRows } from './fakeMatchRpc';
import { FakeSupabase, type FakeAuthUser } from './fakeSupabase';

export const TEAM_A = 'team-a';
export const TEAM_B = 'team-b';

/** Pessoas de teste (senhas só existem na base simulada). */
export const USERS = {
  coach: { id: 'u-coach', email: 'coach@t.test', password: 'senha-teste-coach' },
  analyst: { id: 'u-analyst', email: 'analista@t.test', password: 'senha-teste-analista' },
  viewer: { id: 'u-viewer', email: 'leitor@t.test', password: 'senha-teste-leitor' },
  outsider: { id: 'u-outsider', email: 'sem-equipe@t.test', password: 'senha-teste-fora' },
} satisfies Record<string, FakeAuthUser>;

/** Base simulada com as quatro pessoas cadastradas; ninguém logado e nenhuma equipe ainda. */
export const newFake = () => new FakeSupabase({ users: Object.values(USERS) });

export function seedTeam(fake: FakeSupabase, teamId: string, name: string, members: Partial<Record<keyof typeof USERS, Role>>) {
  fake.seed('teams', [{ id: teamId, name, created_at: '2026-01-01T00:00:00.000Z' }]);
  fake.seed(
    'team_members',
    Object.entries(members).map(([who, role]) => ({ team_id: teamId, user_id: USERS[who as keyof typeof USERS].id, role, created_at: '2026-01-01T00:00:00.000Z' })),
  );
  return fake;
}

/** Grava um workspace na base simulada, pelos mesmos conversores que o app usa (linhas reais do esquema). */
export function seedWorkspace(fake: FakeSupabase, teamId: string, workspace: Partial<Workspace>) {
  const ws = { ...createEmptyWorkspace(), ...workspace };
  fake.seed('players', ws.players.map((p) => ({ ...playerToRow(teamId, p) })));
  fake.seed('evaluations', ws.evaluations.map((e) => ({ ...evaluationToRow(teamId, e) })));
  fake.seed('overall_weights', weightsToRows(teamId, ws.settings.weights).map((r) => ({ ...r })));
  for (const lineup of ws.lineups) {
    const rows = lineupToRows(teamId, lineup);
    fake.seed('lineups', [{ ...rows.lineup }]);
    fake.seed('lineup_starters', rows.starters.map((r) => ({ ...r })));
    fake.seed('lineup_bench', rows.bench.map((r) => ({ ...r })));
  }
  fake.seed('trainings', ws.trainings.map((t) => ({ ...trainingToRow(teamId, t) })));
  fake.seed('training_participants', ws.trainings.flatMap((t) => participantRows(teamId, t).map((r) => ({ ...r }))));
  fake.seed('training_exercises', ws.exercises.map((e) => ({ ...exerciseToRow(teamId, e) })));
  fake.seed('training_events', ws.trainingEvents.map((e) => ({ ...eventToRow(teamId, e) })));
  for (const [table, rows] of Object.entries(matchTableRows(teamId, ws))) fake.seed(table, rows);
  return fake;
}

/** Gateway remoto de uma equipe, já com a pessoa logada na base simulada. */
export function gatewayFor(fake: FakeSupabase, who: keyof typeof USERS, teamId = TEAM_A) {
  fake.signInAs(USERS[who].id);
  return new SupabaseGateway({ client: fake.client, teamId, userId: USERS[who].id });
}
