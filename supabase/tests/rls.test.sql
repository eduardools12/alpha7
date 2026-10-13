-- Testes de RLS, papéis e integridade do esquema do Alpha7.
--
-- Como rodar: execute este arquivo inteiro no SQL do projeto (ou via MCP execute_sql). Ele cria usuários e
-- equipes de teste, simula cada papel (role authenticated + JWT), confere o que deve funcionar e o que deve
-- falhar, e TERMINA SEMPRE com uma exceção, o que desfaz tudo (nada fica gravado):
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
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  uc uuid := gen_random_uuid();
  ud uuid := gen_random_uuid();
  ta uuid;
  tb uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'a@t.test', 'authenticated', 'authenticated'),
    (ub, 'b@t.test', 'authenticated', 'authenticated'),
    (uc, 'c@t.test', 'authenticated', 'authenticated'),
    (ud, 'd@t.test', 'authenticated', 'authenticated');

  -- ───── A cria a equipe A e vira coach ─────
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ta := public.create_team('Equipe A');
  perform private.t_count(format('select count(*) from public.team_members where team_id = %L and role = ''coach''', ta), 1);

  insert into public.players (team_id, id, name, jersey_number, primary_position, created_at, updated_at) values
    (ta, 'p1', 'Ana Alves', 10, 'ponteiro', now(), now()),
    (ta, 'p2', 'Bia Borges', 11, 'oposto', now(), now());
  -- camisa repetida na mesma equipe é recusada; secundária igual à principal também
  perform private.t_fail(format('insert into public.players (team_id,id,name,jersey_number,primary_position,created_at,updated_at) values (%L,''p3'',''Cris'',10,''central'',now(),now())', ta), array['23505']);
  perform private.t_fail(format('insert into public.players (team_id,id,name,jersey_number,primary_position,secondary_position,created_at,updated_at) values (%L,''p3'',''Cris'',12,''central'',''central'',now(),now())', ta), array['23514']);

  insert into public.trainings (team_id, id, name, held_on, created_at, updated_at) values
    (ta, 't1', 'Treino 1', '2026-10-01', now(), now()),
    (ta, 't2', 'Treino 2', '2026-10-02', now(), now());
  insert into public.training_participants values (ta, 't1', 'p1'), (ta, 't2', 'p1');
  insert into public.training_exercises (team_id, id, training_id, name, sort_order, created_at) values
    (ta, 'x1', 't1', 'Saque', 0, now()), (ta, 'x2', 't2', 'Ataque', 0, now());
  insert into public.training_events (team_id, id, training_id, exercise_id, player_id, fundamental, outcome, recorded_at, attempt_key)
    values (ta, 'e1', 't1', 'x1', 'p1', 'saque', 'ace', now(), 'k1');
  -- concluído exige completed_at e vice-versa
  perform private.t_fail(format('update public.trainings set status = ''concluido'' where team_id = %L and id = ''t2''', ta), array['23514']);

  -- ───── B cria a equipe B: não vê nem altera nada de A ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tb := public.create_team('Equipe B');
  insert into public.players (team_id, id, name, jersey_number, primary_position, created_at, updated_at)
    values (tb, 'pb', 'Bruna B.', 10, 'libero', now(), now()); -- mesma camisa 10 em outra equipe: permitido
  perform private.t_count('select count(*) from public.players', 1);
  perform private.t_count(format('select count(*) from public.players where team_id = %L', ta), 0);
  perform private.t_count(format('select count(*) from public.team_members where team_id = %L', ta), 0);
  perform private.t_count('select count(*) from public.teams', 1);
  perform private.t_rows(format('update public.players set name = ''Hack'' where team_id = %L', ta), 0);
  perform private.t_rows(format('delete from public.players where team_id = %L', ta), 0);
  perform private.t_fail(format('insert into public.players (team_id,id,name,jersey_number,primary_position,created_at,updated_at) values (%L,''px'',''Intruso'',50,''central'',now(),now())', ta), array['42501']);
  perform private.t_fail(format('insert into public.team_members (team_id,user_id,role) values (%L,%L,''coach'')', ta, ub), array['42501']);
  perform private.t_fail(format('select public.add_team_member(%L,''b@t.test'',''coach'')', ta), array['42501']);

  -- ───── A convida C (analyst) e D (viewer) ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.add_team_member(ta, 'C@T.test', 'analyst');
  perform public.add_team_member(ta, 'd@t.test', 'viewer');
  perform private.t_fail(format('select public.add_team_member(%L,''ninguem@t.test'',''viewer'')', ta), array['P0002']);
  perform private.t_fail(format('select public.add_team_member(%L,''d@t.test'',''admin'')', ta), array['22023']);
  perform private.t_count(format('select count(*) from public.team_members where team_id = %L', ta), 3);
  -- integridade entre equipes: avaliação de A apontando para atleta de B não passa (chave composta com team_id)
  perform private.t_fail(format('insert into public.evaluations (team_id,id,player_id,evaluated_at,sac,rec,lev,ata,blq,def,vel,imp,lei,created_at) values (%L,''ev9'',''pb'',''2026-10-01'',50,50,50,50,50,50,50,50,50,now())', ta), array['23503']);

  -- ───── C (analyst): registra, mas não edita elenco nem apaga ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform private.t_count(format('select count(*) from public.players where team_id = %L', ta), 2);
  insert into public.evaluations (team_id, id, player_id, evaluated_at, sac, rec, lev, ata, blq, def, vel, imp, lei, created_at)
    values (ta, 'ev1', 'p1', '2026-10-01', 70, 70, 70, 70, 70, 70, 70, 70, 70, now());
  perform private.t_fail(format('update public.evaluations set sac = 80 where team_id = %L and id = ''ev1''', ta), array['42501']);
  perform private.t_fail(format('delete from public.evaluations where team_id = %L and id = ''ev1''', ta), array['42501']);
  perform private.t_fail(format('insert into public.evaluations (team_id,id,player_id,evaluated_at,sac,rec,lev,ata,blq,def,vel,imp,lei,created_at) values (%L,''ev2'',''p1'',''2026-10-01'',0,50,50,50,50,50,50,50,50,now())', ta), array['23514']); -- nota fora de 1 a 99
  perform private.t_fail(format('insert into public.players (team_id,id,name,jersey_number,primary_position,created_at,updated_at) values (%L,''px'',''Intruso'',50,''central'',now(),now())', ta), array['42501']);
  perform private.t_rows(format('update public.players set name = ''Hack'' where team_id = %L', ta), 0);
  insert into public.training_events (team_id, id, training_id, exercise_id, player_id, fundamental, outcome, recorded_at, attempt_key)
    values (ta, 'e2', 't1', 'x1', 'p1', 'recepcao', 'A', now(), 'k2');
  perform private.t_fail(format('insert into public.training_events (team_id,id,training_id,exercise_id,player_id,fundamental,outcome,recorded_at,attempt_key) values (%L,''e3'',''t1'',''x1'',''p1'',''recepcao'',''B'',now(),''k2'')', ta), array['23505']); -- attempt_key repetida
  perform private.t_fail(format('insert into public.training_events (team_id,id,training_id,exercise_id,player_id,fundamental,outcome,recorded_at,attempt_key) values (%L,''e3'',''t1'',''x1'',''p2'',''saque'',''ace'',now(),''k3'')', ta), array['23514']); -- atleta fora do treino
  perform private.t_fail(format('insert into public.training_events (team_id,id,training_id,exercise_id,player_id,fundamental,outcome,recorded_at,attempt_key) values (%L,''e3'',''t1'',''x2'',''p1'',''saque'',''ace'',now(),''k3'')', ta), array['23503']); -- exercício de OUTRO treino
  perform private.t_fail(format('insert into public.training_events (team_id,id,training_id,exercise_id,player_id,fundamental,outcome,recorded_at,attempt_key) values (%L,''e3'',''t1'',''x1'',''p1'',''saque'',''A'',now(),''k3'')', ta), array['23514']); -- resultado incompatível com o fundamento
  perform private.t_fail(format('update public.training_events set outcome = ''erro'' where team_id = %L and id = ''e1''', ta), array['42501']); -- só voided_at/voided_by são editáveis
  perform private.t_fail(format('delete from public.training_events where team_id = %L and id = ''e1''', ta), array['42501']);
  perform private.t_rows(format('update public.training_events set voided_at = now(), voided_by = %L where team_id = %L and id = ''e2''', uc, ta), 1); -- anular
  perform private.t_fail(format('update public.training_events set voided_at = null where team_id = %L and id = ''e2''', ta), array['23514']); -- reativar
  perform private.t_rows(format('delete from public.trainings where team_id = %L and id = ''t1''', ta), 0); -- analyst não exclui treino
  insert into public.trainings (team_id, id, name, held_on, created_at, updated_at) values (ta, 't3', 'Treino 3', '2026-10-03', now(), now()); -- analyst cria treino
  perform private.t_fail(format('insert into public.team_members (team_id,user_id,role) values (%L,%L,''coach'')', ta, uc), array['42501']);

  -- ───── D (viewer): só leitura ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform private.t_count(format('select count(*) from public.players where team_id = %L', ta), 2);
  perform private.t_count(format('select count(*) from public.training_events where team_id = %L', ta), 2);
  perform private.t_fail(format('insert into public.evaluations (team_id,id,player_id,evaluated_at,sac,rec,lev,ata,blq,def,vel,imp,lei,created_at) values (%L,''ev3'',''p1'',''2026-10-01'',50,50,50,50,50,50,50,50,50,now())', ta), array['42501']);
  perform private.t_fail(format('insert into public.training_events (team_id,id,training_id,exercise_id,player_id,fundamental,outcome,recorded_at,attempt_key) values (%L,''e9'',''t1'',''x1'',''p1'',''saque'',''ace'',now(),''k9'')', ta), array['42501']);
  perform private.t_rows(format('update public.trainings set name = ''Hack'' where team_id = %L', ta), 0);

  -- ───── anon: nenhuma tabela ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    perform count(*) from public.players;
    raise exception 'DEVERIA_FALHAR: anon leu players';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.create_team('Anon');
    raise exception 'DEVERIA_FALHAR: anon executou create_team';
  exception when insufficient_privilege then null;
  end;

  -- ───── coach A: exclusão de treino leva exercícios, participantes e registros; não leva avaliações ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform private.t_rows(format('delete from public.trainings where team_id = %L and id = ''t1''', ta), 1);
  perform private.t_count(format('select count(*) from public.training_events where team_id = %L and training_id = ''t1''', ta), 0);
  perform private.t_count(format('select count(*) from public.training_exercises where team_id = %L and training_id = ''t1''', ta), 0);
  perform private.t_count(format('select count(*) from public.training_participants where team_id = %L and training_id = ''t1''', ta), 0);
  perform private.t_count(format('select count(*) from public.evaluations where team_id = %L', ta), 1);
  -- atleta com registros em outro treino não pode ser excluído do elenco? (p1 está em t2 como participante)
  perform private.t_fail(format('delete from public.players where team_id = %L and id = ''p1''', ta), array['23503']);

  -- ───── nem o dono do banco edita avaliação (gatilho) ─────
  reset role;
  perform private.t_fail('update public.evaluations set sac = 99', array['23514']);

  raise exception 'TESTES_OK: papéis, RLS, integridade entre equipes, append-only e cascatas verificados';
end
$t$;
