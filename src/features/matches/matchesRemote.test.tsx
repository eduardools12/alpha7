/**
 * Partidas com o backend Supabase SIMULADO: papéis na interface, gravação pelas funções do banco, tela atrasada e falta de
 * conexão. A recusa de verdade (RLS e funções SQL) é provada em supabase/tests/matches.test.sql, no PostgreSQL real.
 */
import { screen, waitFor, within } from '@testing-library/react';
import { makeMatch, makeMatchSet, makePlayer } from '@/test/factories';
import { renderRemote } from '@/test/renderRemote';
import { TEAM_A, TEAM_B, USERS, newFake, seedTeam, seedWorkspace } from '@/test/remoteFixtures';

const NOW = '2026-10-01T10:00:00.000Z';
const ids = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const players = ids.map((id, i) => makePlayer({ id, name: `Atleta ${String.fromCharCode(65 + i)}${String.fromCharCode(65 + i)}`, jerseyNumber: i + 1 }));
const SHORT = { bestOf: 3, setPoints: 5, decidingSetPoints: 3, minLead: 2 } as const;

function seeded() {
  const fake = newFake();
  seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach', analyst: 'analyst', viewer: 'viewer' });
  seedTeam(fake, TEAM_B, 'Equipe B', { outsider: 'coach' });
  seedWorkspace(fake, TEAM_A, {
    players,
    matches: [makeMatch({ id: 'm1', opponent: 'Rivais', status: 'em_andamento', format: { ...SHORT } })],
    matchSets: [makeMatchSet('m1', 1, ids)],
  });
  seedWorkspace(fake, TEAM_B, {
    players: [makePlayer({ id: 'zb', name: 'Zeca Outro', jerseyNumber: 9 })],
    matches: [makeMatch({ id: 'mb', opponent: 'Time da Outra Equipe' })],
  });
  return fake;
}

const as = (fake: ReturnType<typeof newFake>, who: keyof typeof USERS) => fake.signInAs(USERS[who].id);
const pointsOf = (side: 'Alpha7' | 'Rivais') => screen.getByLabelText(new RegExp(`^${side}: \\d+ pontos$`)).textContent;

describe('partidas por papel (cliente simulado)', () => {
  it('viewer só lê: sem criar, editar, excluir, acompanhar; as rotas de escrita são barradas', async () => {
    const fake = seeded();
    as(fake, 'viewer');
    renderRemote(fake, { path: '/partidas' });
    expect(await screen.findByRole('heading', { name: 'Alpha7 x Rivais' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Nova partida' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Acompanhar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Editar partida/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excluir partida/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Detalhes' })).toBeInTheDocument();
  });

  it.each(['/partidas/nova', '/partidas/m1/editar', '/partidas/m1/acompanhar'])('viewer abrindo %s pelo endereço recebe a explicação', async (path) => {
    const fake = seeded();
    as(fake, 'viewer');
    renderRemote(fake, { path });
    expect(await screen.findByText('Seu papel não permite esta ação')).toBeInTheDocument();
    expect(screen.getByText(/criar ou editar partidas e registrar pontos/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ponto do Alpha7' })).not.toBeInTheDocument();
    expect(fake.rpcCalls.filter((c) => c.name !== 'create_team')).toEqual([]);
  });

  it('analyst acompanha e edita, mas não exclui nem reabre', async () => {
    const fake = seeded();
    as(fake, 'analyst');
    renderRemote(fake, { path: '/partidas' });
    expect(await screen.findByRole('link', { name: 'Acompanhar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar partida contra Rivais' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Excluir partida/ })).not.toBeInTheDocument();
  });

  it('coach exclui; só vê as partidas da própria equipe', async () => {
    const fake = seeded();
    as(fake, 'coach');
    renderRemote(fake, { path: '/partidas' });
    expect(await screen.findByRole('button', { name: 'Excluir partida contra Rivais' })).toBeInTheDocument();
    expect(screen.queryByText(/Time da Outra Equipe/)).not.toBeInTheDocument();
    expect(fake.calls.filter((c) => c.table === 'matches').every((c) => c.eq.team_id === TEAM_A)).toBe(true);
  });

  it('um analyst não reabre partida concluída; o coach reabre', async () => {
    const fake = newFake();
    seedTeam(fake, TEAM_A, 'Equipe A', { coach: 'coach', analyst: 'analyst' });
    seedWorkspace(fake, TEAM_A, {
      players,
      matches: [makeMatch({ id: 'm1', opponent: 'Rivais', status: 'concluida', finalSetsUs: 1, finalSetsThem: 0, concludedAt: NOW, format: { ...SHORT } })],
    });
    as(fake, 'analyst');
    const analyst = renderRemote(fake, { path: '/partidas/m1/acompanhar' });
    expect(await screen.findByText('Esta partida está concluída')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reabrir para corrigir' })).not.toBeInTheDocument();
    analyst.unmount();
    as(fake, 'coach');
    const coach = renderRemote(fake, { path: '/partidas/m1/acompanhar' });
    await coach.user.click(await screen.findByRole('button', { name: 'Reabrir para corrigir' }));
    await waitFor(() => expect(fake.rows('matches', TEAM_A)[0]?.status).toBe('em_andamento'));
  });
});

describe('acompanhamento com o banco simulado', () => {
  it('cada ponto é gravado pela função do banco, na equipe certa, com saque e rotação calculados lá', async () => {
    const fake = seeded();
    as(fake, 'coach');
    const ctx = renderRemote(fake, { path: '/partidas/m1/acompanhar' });
    await ctx.user.click(await screen.findByRole('button', { name: 'Ponto do Alpha7' }));
    await waitFor(() => expect(pointsOf('Alpha7')).toBe('1'));
    const call = fake.rpcCalls.find((c) => c.name === 'record_rally');
    expect(call?.args).toMatchObject({ p_team: TEAM_A, p_match: 'm1', p_rally: { set_number: 1, expected_seq: 1, winner: 'us' } });
    expect(JSON.stringify(call?.args)).not.toMatch(/rotation|serving|server_player/); // o cliente não manda saque nem rotação
    expect(fake.rows('rallies', TEAM_A)).toHaveLength(1);
    expect(fake.rows('rallies', TEAM_A)[0]).toMatchObject({ serving_side: 'us', rotation: 0, server_player_id: 'p1', seq: 1 });
    expect(fake.rows('rallies', TEAM_B)).toHaveLength(0);
  });

  it('tela atrasada: outra pessoa já registrou o ponto; nada é gravado, os dados são recarregados e a pessoa é avisada', async () => {
    const fake = seeded();
    as(fake, 'coach');
    const ctx = renderRemote(fake, { path: '/partidas/m1/acompanhar' });
    const button = await screen.findByRole('button', { name: 'Ponto do Alpha7' });
    // Outro celular registra o ponto 1 (do adversário) antes deste toque.
    fake.seed('rallies', [
      { team_id: TEAM_A, id: 'r-outro', match_id: 'm1', set_number: 1, seq: 1, serving_side: 'us', winner_side: 'them', rotation: 0, server_player_id: 'p1', reason: null, player_id: null, attempt_key: 'k-outro', recorded_at: NOW, voided_at: null, voided_by: null },
    ]);
    await ctx.user.click(button);
    expect(await screen.findByText('Outra pessoa registrou um ponto neste meio-tempo. A tela foi atualizada.')).toBeInTheDocument();
    await waitFor(() => expect(pointsOf('Rivais')).toBe('1')); // recarregou
    expect(pointsOf('Alpha7')).toBe('0');
    expect(fake.rows('rallies', TEAM_A)).toHaveLength(1); // o toque atrasado não gravou nada
    // Repetindo agora, olhando o placar atual, o ponto entra no lugar certo.
    await ctx.user.click(await screen.findByRole('button', { name: 'Ponto do Alpha7' }));
    await waitFor(() => expect(pointsOf('Alpha7')).toBe('1'));
    expect(fake.rows('rallies', TEAM_A).map((r) => r.seq)).toEqual([1, 2]);
  });

  it('sem conexão: o ponto não é gravado, a mensagem diz isso e o placar não muda', async () => {
    const fake = seeded();
    as(fake, 'coach');
    const ctx = renderRemote(fake, { path: '/partidas/m1/acompanhar' });
    const button = await screen.findByRole('button', { name: 'Ponto do Alpha7' });
    fake.offline = true;
    await ctx.user.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sem conexão com o servidor');
    expect(pointsOf('Alpha7')).toBe('0');
    fake.offline = false;
    expect(fake.rows('rallies', TEAM_A)).toHaveLength(0);
    await ctx.user.click(await screen.findByRole('button', { name: 'Ponto do Alpha7' }));
    await waitFor(() => expect(pointsOf('Alpha7')).toBe('1'));
    expect(within(screen.getByRole('region', { name: 'Placar' })).queryByText('Sem conexão')).not.toBeInTheDocument();
  });

  it('a sessão expirada é explicada e nada é gravado', async () => {
    const fake = seeded();
    as(fake, 'coach');
    const ctx = renderRemote(fake, { path: '/partidas/m1/acompanhar' });
    const button = await screen.findByRole('button', { name: 'Ponto do Alpha7' });
    fake.rpcFailure = { code: 'PGRST301', message: 'JWT expired', details: '', hint: '' };
    await ctx.user.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('Sua sessão expirou');
    expect(fake.rows('rallies', TEAM_A)).toHaveLength(0);
  });
});
