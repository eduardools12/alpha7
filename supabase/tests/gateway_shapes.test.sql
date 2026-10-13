-- Confere, NO BANCO DE VERDADE e com a RLS real, as formas de SQL que o SupabaseGateway gera (via PostgREST) e as
-- inferências que ele faz sobre respostas da RLS. Complementa supabase/tests/rls.test.sql.
--
-- Como rodar: execute o arquivo inteiro no SQL do projeto (ou via MCP execute_sql). Termina SEMPRE com uma exceção,
-- o que desfaz tudo (nenhum dado de teste fica gravado):
--   * "TESTES_OK ..."  → todas as verificações passaram;
--   * qualquer outra mensagem → a verificação que falhou.

create function private.t_fail(p_sql text, p_states text[]) returns void language plpgsql as $f$
begin
  begin
    execute p_sql;
  exception when others then
    if sqlstate = any (p_states) then return; end if;
    raise exception 'ERRO_INESPERADO % (esperado %): % :: %', sqlstate, p_states, sqlerrm, p_sql;
  end;
  raise exception 'DEVERIA_FALHAR: %', p_sql;
end
$f$;

create function private.t_rows(p_sql text, p_expected int) returns void language plpgsql as $f$
declare n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  if n <> p_expected then raise exception 'LINHAS % (esperado %): %', n, p_expected, p_sql; end if;
end
$f$;

create function private.t_count(p_sql text, p_expected int) returns void language plpgsql as $f$
declare n int;
begin
  execute p_sql into n;
  if n <> p_expected then raise exception 'CONTAGEM % (esperado %): %', n, p_expected, p_sql; end if;
end
$f$;

do $t$
declare
  uc uuid := gen_random_uuid(); -- coach
  ua uuid := gen_random_uuid(); -- analyst
  uv uuid := gen_random_uuid(); -- viewer
  uo uuid := gen_random_uuid(); -- sem equipe
  tid uuid;
  tid2 uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (uc, 'coach@t.test', 'authenticated', 'authenticated'),
    (ua, 'analista@t.test', 'authenticated', 'authenticated'),
    (uv, 'leitor@t.test', 'authenticated', 'authenticated'),
    (uo, 'fora@t.test', 'authenticated', 'authenticated');

  -- ───── coach cria a equipe e convida os outros ─────
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tid := public.create_team('Equipe A');
  perform public.add_team_member(tid, 'analista@t.test', 'analyst');
  perform public.add_team_member(tid, 'leitor@t.test', 'viewer');

  -- ───── upsert de atleta (INSERT ... ON CONFLICT (team_id,id) DO UPDATE), como o PostgREST gera ─────
  insert into public.players (team_id, id, name, jersey_number, primary_position, created_at, updated_at)
    values (tid, 'p1', 'Ana Alves', 1, 'levantador', now(), now()), (tid, 'p2', 'Bia Borges', 2, 'oposto', now(), now()), (tid, 'p3', 'Cris Costa', 3, 'libero', now(), now());
  insert into public.players (team_id, id, name, jersey_number, primary_position, created_at, updated_at)
    values (tid, 'p1', 'Ana A. Alves', 1, 'levantador', now(), now())
    on conflict (team_id, id) do update set name = excluded.name, jersey_number = excluded.jersey_number, primary_position = excluded.primary_position, updated_at = excluded.updated_at;
  perform private.t_count(format('select count(*) from public.players where team_id = %L and name = ''Ana A. Alves''', tid), 1);
  perform private.t_count(format('select count(*) from public.players where team_id = %L', tid), 3);
  -- camisa de outro atleta: 23505 na restrição que o gateway reconhece pelo nome
  begin
    insert into public.players (team_id, id, name, jersey_number, primary_position, created_at, updated_at)
      values (tid, 'p9', 'Dani', 1, 'central', now(), now()) on conflict (team_id, id) do update set name = excluded.name;
    raise exception 'DEVERIA_FALHAR: camisa duplicada';
  exception when unique_violation then
    if sqlerrm !~ 'jersey_number' then raise exception 'nome da restrição inesperado: %', sqlerrm; end if;
  end;

  -- ───── pesos do Overall: cinco linhas em UMA instrução (upsert em lote) ─────
  insert into public.overall_weights (team_id, position, sac, rec, lev, ata, blq, def, vel, imp, lei) values
    (tid, 'levantador', 8, 4, 34, 4, 8, 10, 8, 4, 20), (tid, 'oposto', 12, 2, 0, 34, 14, 8, 8, 14, 8),
    (tid, 'ponteiro', 12, 22, 0, 22, 6, 16, 8, 8, 6), (tid, 'central', 8, 0, 0, 22, 36, 4, 8, 14, 8), (tid, 'libero', 0, 32, 8, 0, 0, 34, 12, 0, 14)
    on conflict (team_id, position) do update set sac = excluded.sac, rec = excluded.rec, lev = excluded.lev, ata = excluded.ata, blq = excluded.blq, def = excluded.def, vel = excluded.vel, imp = excluded.imp, lei = excluded.lei;
  insert into public.overall_weights (team_id, position, sac, rec, lev, ata, blq, def, vel, imp, lei) values
    (tid, 'ponteiro', 40, 22, 0, 22, 6, 16, 8, 8, 6)
    on conflict (team_id, position) do update set sac = excluded.sac;
  perform private.t_count(format('select count(*) from public.overall_weights where team_id = %L', tid), 5);
  perform private.t_count(format('select sac::int from public.overall_weights where team_id = %L and position = ''ponteiro''', tid), 40);

  -- ───── escalação: trocar dois titulares NÃO funciona por UPDATE (é por isso que o gateway apaga e reinsere) ─────
  insert into public.lineups (team_id, id, title, created_at, updated_at, libero_id) values (tid, 'l1', 'Titular', now(), now(), 'p3');
  insert into public.lineup_starters (team_id, lineup_id, slot, player_id, role) values (tid, 'l1', 0, 'p1', 'levantador'), (tid, 'l1', 1, 'p2', 'ponteiro');
  perform private.t_fail(format('update public.lineup_starters set player_id = case slot when 0 then ''p2'' else ''p1'' end where team_id = %L and lineup_id = ''l1''', tid), array['23505']);
  delete from public.lineup_starters where team_id = tid and lineup_id = 'l1';
  insert into public.lineup_starters (team_id, lineup_id, slot, player_id, role) values (tid, 'l1', 0, 'p2', 'ponteiro'), (tid, 'l1', 1, 'p1', 'levantador');
  perform private.t_count(format('select count(*) from public.lineup_starters where team_id = %L and lineup_id = ''l1'' and slot = 0 and player_id = ''p2''', tid), 1);

  -- treino com participantes e exercícios, para os testes de registro
  insert into public.trainings (team_id, id, name, held_on, created_at, updated_at) values (tid, 't1', 'Treino A', '2026-10-01', now(), now());
  insert into public.training_participants values (tid, 't1', 'p1'), (tid, 't1', 'p2');
  insert into public.training_exercises (team_id, id, training_id, name, sort_order, created_at) values (tid, 'x1', 't1', 'Saque', 0, now());

  -- ───── analyst registra de forma idempotente: INSERT ... ON CONFLICT (team_id, attempt_key) DO NOTHING ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into public.training_events (team_id, id, training_id, exercise_id, player_id, fundamental, outcome, recorded_at, attempt_key)
    values (tid, 'e1', 't1', 'x1', 'p1', 'saque', 'ace', now(), 'k1') on conflict (team_id, attempt_key) do nothing;
  perform private.t_rows(format('insert into public.training_events (team_id,id,training_id,exercise_id,player_id,fundamental,outcome,recorded_at,attempt_key) values (%L,''e1-reenvio'',''t1'',''x1'',''p1'',''saque'',''ace'',now(),''k1'') on conflict (team_id, attempt_key) do nothing', tid), 0);
  perform private.t_count(format('select count(*) from public.training_events where team_id = %L', tid), 1);
  -- mesma id com outra chave: o gateway recebe 23505 de chave primária e mostra "Já existe um registro"
  perform private.t_fail(format('insert into public.training_events (team_id,id,training_id,exercise_id,player_id,fundamental,outcome,recorded_at,attempt_key) values (%L,''e1'',''t1'',''x1'',''p2'',''saque'',''ace'',now(),''k-outra'') on conflict (team_id, attempt_key) do nothing', tid), array['23505']);

  -- ───── anular: UPDATE ... WHERE voided_at IS NULL RETURNING id ─────
  perform private.t_rows(format('update public.training_events set voided_at = now(), voided_by = %L where team_id = %L and id = ''e1'' and voided_at is null returning id', ua, tid), 1);
  perform private.t_rows(format('update public.training_events set voided_at = now(), voided_by = %L where team_id = %L and id = ''e1'' and voided_at is null returning id', ua, tid), 0); -- repetir não muda nada
  perform private.t_count(format('select count(*) from public.training_events where team_id = %L and id = ''e1'' and voided_at is not null', tid), 1);

  -- reinsere um registro válido para os testes de permissão abaixo
  insert into public.training_events (team_id, id, training_id, exercise_id, player_id, fundamental, outcome, recorded_at, attempt_key)
    values (tid, 'e2', 't1', 'x1', 'p2', 'recepcao', 'A', now(), 'k2');

  -- ───── viewer: o gateway infere "permissão negada" desta resposta da RLS ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uv, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform private.t_rows(format('update public.training_events set voided_at = now(), voided_by = %L where team_id = %L and id = ''e2'' and voided_at is null returning id', uv, tid), 0); -- sem erro, sem linha
  perform private.t_count(format('select count(*) from public.training_events where team_id = %L and id = ''e2'' and voided_at is null', tid), 1); -- a linha existe e continua ativa
  perform private.t_fail(format('insert into public.training_events (team_id,id,training_id,exercise_id,player_id,fundamental,outcome,recorded_at,attempt_key) values (%L,''e9'',''t1'',''x1'',''p1'',''saque'',''ace'',now(),''k9'') on conflict (team_id, attempt_key) do nothing', tid), array['42501']);
  perform private.t_fail(format('insert into public.players (team_id,id,name,jersey_number,primary_position,created_at,updated_at) values (%L,''p1'',''Hack'',1,''central'',now(),now()) on conflict (team_id,id) do update set name = excluded.name', tid), array['42501']); -- upsert sobre linha existente

  -- ───── exclusão sem permissão não dá erro: apaga 0 linhas (o gateway confere se a linha ainda existe) ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform private.t_rows(format('delete from public.trainings where team_id = %L and id = ''t1'' returning id', tid), 0);
  perform private.t_rows(format('delete from public.lineups where team_id = %L and id = ''l1'' returning id', tid), 0);
  perform private.t_count(format('select count(*) from public.trainings where team_id = %L and id = ''t1''', tid), 1);

  -- ───── saveTraining: remover exercício com registros é recusado (23503 do lado do banco) ─────
  perform private.t_fail(format('delete from public.training_exercises where team_id = %L and training_id = ''t1'' and id in (''x1'')', tid), array['23503']);

  -- ───── descoberta de equipes (TeamGate): só as equipes da própria pessoa ─────
  perform private.t_count(format('select count(*) from public.team_members where user_id = %L', ua), 1);
  perform private.t_count(format('select count(*) from public.teams where id in (%L)', tid), 1);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uo, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform private.t_count(format('select count(*) from public.team_members where user_id = %L', ua), 0); -- quem não é membro não vê nem os vínculos alheios
  perform private.t_count(format('select count(*) from public.teams where id in (%L)', tid), 0);
  perform private.t_count(format('select count(*) from public.players where team_id = %L', tid), 0);
  tid2 := public.create_team('Equipe Nova'); -- sem equipe: cria a primeira e vira coach
  perform private.t_count(format('select count(*) from public.team_members where team_id = %L and user_id = %L and role = ''coach''', tid2, uo), 1);

  -- ───── coach: exclusão leva exercícios, participantes e registros ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform private.t_rows(format('delete from public.trainings where team_id = %L and id = ''t1'' returning id', tid), 1);
  perform private.t_count(format('select count(*) from public.training_events where team_id = %L', tid), 0);
  perform private.t_rows(format('delete from public.lineups where team_id = %L and id = ''l1'' returning id', tid), 1);
  perform private.t_count(format('select count(*) from public.lineup_starters where team_id = %L', tid), 0);

  raise exception 'TESTES_OK: formas de SQL do gateway, inferências de permissão e descoberta de equipes verificadas com a RLS real';
end
$t$;
