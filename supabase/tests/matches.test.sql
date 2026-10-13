-- Testes de partidas, sets, rallies e ações técnicas no PostgreSQL REAL (migração 20261014000000_matches).
--
-- Como rodar: execute este arquivo inteiro no SQL do projeto (ou via MCP execute_sql), DEPOIS de aplicar a migração.
-- Ele cria usuários e equipes de teste, simula cada papel (role authenticated + JWT), confere o que deve funcionar e
-- o que deve falhar, e TERMINA SEMPRE com uma exceção, o que desfaz tudo (nada fica gravado):
--   * "TESTES_OK ..."  → todas as verificações passaram;
--   * qualquer outra mensagem → a verificação que falhou.
-- Estes testes usam o mesmo formato curto (melhor de 3, 5 pontos, decisivo de 3) para ficarem legíveis; a regra de
-- 25/15 é a mesma função com outros parâmetros e é coberta pelos testes de domínio (src/domain/match.test.ts).

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

-- Registra uma sequência de rallies: u = Alpha7 ganhou o ponto, t = adversário ganhou.
create function private.t_play(p_team uuid, p_match text, p_set int, p_seq text) returns void language plpgsql as $f$
declare
  i int;
  v_next int;
begin
  for i in 1 .. length(p_seq) loop
    select coalesce(max(seq), 0) + 1 into v_next from public.rallies
      where team_id = p_team and match_id = p_match and set_number = p_set and voided_at is null;
    perform public.record_rally(p_team, p_match, jsonb_build_object(
      'id', 'r-' || gen_random_uuid()::text, 'attempt_key', 'k-' || gen_random_uuid()::text, 'set_number', p_set,
      'expected_seq', v_next, 'winner', case substr(p_seq, i, 1) when 'u' then 'us' else 'them' end));
  end loop;
end
$f$;

create function private.t_last_rally(p_team uuid, p_match text, p_set int) returns text language sql as $f$
  select id from public.rallies where team_id = p_team and match_id = p_match and set_number = p_set and voided_at is null order by seq desc limit 1
$f$;

do $t$
declare
  ua uuid := gen_random_uuid(); -- coach da equipe A
  ub uuid := gen_random_uuid(); -- coach da equipe B
  uc uuid := gen_random_uuid(); -- analyst de A
  ud uuid := gen_random_uuid(); -- viewer de A
  ta uuid;
  tb uuid;
  starters jsonb := '[{"slot":0,"player_id":"p1","role":"levantador"},{"slot":1,"player_id":"p2","role":"oposto"},{"slot":2,"player_id":"p3","role":"ponteiro"},{"slot":3,"player_id":"p4","role":"central"},{"slot":4,"player_id":"p5","role":"ponteiro"},{"slot":5,"player_id":"p6","role":"central"}]';
  res jsonb;
  v_last text;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'a@m.test', 'authenticated', 'authenticated'),
    (ub, 'b@m.test', 'authenticated', 'authenticated'),
    (uc, 'c@m.test', 'authenticated', 'authenticated'),
    (ud, 'd@m.test', 'authenticated', 'authenticated');

  -- ───── A (coach): equipe, elenco e partida ─────
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ta := public.create_team('Equipe A');
  insert into public.players (team_id, id, name, jersey_number, primary_position, created_at, updated_at) values
    (ta, 'p1', 'Ana', 1, 'levantador', now(), now()), (ta, 'p2', 'Bia', 2, 'oposto', now(), now()),
    (ta, 'p3', 'Cris', 3, 'ponteiro', now(), now()), (ta, 'p4', 'Dani', 4, 'central', now(), now()),
    (ta, 'p5', 'Eva', 5, 'ponteiro', now(), now()), (ta, 'p6', 'Fabi', 6, 'central', now(), now()),
    (ta, 'p7', 'Gabi', 7, 'libero', now(), now()), (ta, 'p8', 'Helo', 8, 'ponteiro', now(), now());

  insert into public.matches (team_id, id, opponent, competition, scheduled_at, venue, best_of, set_points, deciding_set_points, min_lead, created_at, updated_at)
    values (ta, 'm1', 'Rivais', 'Liga', '2026-10-20T19:30', 'Ginásio', 3, 5, 3, 2, now(), now());
  perform private.t_count(format('select count(*) from public.matches where team_id = %L and status = ''agendada''', ta), 1);

  -- Validações da tabela
  perform private.t_fail(format('insert into public.matches (team_id,id,opponent,created_at,updated_at) values (%L,''mx'',''X'',now(),now())', ta), array['23514']); -- adversário curto
  perform private.t_fail(format('insert into public.matches (team_id,id,opponent,scheduled_at,created_at,updated_at) values (%L,''mx'',''Rivais'',''20/10/2026'',now(),now())', ta), array['23514']);
  perform private.t_fail(format('insert into public.matches (team_id,id,opponent,best_of,created_at,updated_at) values (%L,''mx'',''Rivais'',4,now(),now())', ta), array['23514']);
  -- Status e resultado não são graváveis direto, nem pelo coach
  perform private.t_fail(format('insert into public.matches (team_id,id,opponent,status,created_at,updated_at) values (%L,''mx'',''Rivais'',''concluida'',now(),now())', ta), array['42501']);
  perform private.t_fail(format('update public.matches set status = ''concluida'' where team_id = %L and id = ''m1''', ta), array['42501']);
  perform private.t_fail(format('update public.matches set final_sets_us = 3 where team_id = %L and id = ''m1''', ta), array['42501']);
  -- Sets, rallies e ações NÃO aceitam gravação direta pelas tabelas
  perform private.t_fail(format('insert into public.match_sets (team_id,match_id,number,first_server,created_at) values (%L,''m1'',1,''us'',now())', ta), array['42501']);
  perform private.t_fail(format('insert into public.rallies (team_id,id,match_id,set_number,seq,serving_side,winner_side,rotation,attempt_key,recorded_at) values (%L,''rx'',''m1'',1,1,''us'',''us'',0,''kx'',now())', ta), array['42501']);
  perform private.t_fail(format('delete from public.rallies where team_id = %L', ta), array['42501']);

  -- ───── start_set: validações ─────
  perform private.t_fail(format('select public.start_set(%L,''m1'',%L::jsonb)', ta, '{"number":2,"first_server":"us","starters":' || starters::text || '}'), array['40001']); -- número errado
  perform private.t_fail(format('select public.start_set(%L,''m1'',%L::jsonb)', ta, '{"number":1,"first_server":"nos","starters":' || starters::text || '}'), array['P0001']);
  perform private.t_fail(format('select public.start_set(%L,''m1'',%L::jsonb)', ta, '{"number":1,"first_server":"us","starters":[]}'), array['P0001']); -- sem titulares
  perform private.t_fail(format('select public.start_set(%L,''m1'',%L::jsonb)', ta, '{"number":1,"first_server":"us","libero_id":"p1","starters":' || starters::text || '}'), array['P0001']); -- líbero entre titulares
  perform private.t_fail(format('select public.start_set(%L,''m1'',%L::jsonb)', ta, '{"number":1,"first_server":"us","starters":' || replace(starters::text, '"p2"', '"p1"') || '}'), array['23505']); -- atleta duplicado
  perform private.t_fail(format('select public.start_set(%L,''m1'',%L::jsonb)', ta, '{"number":1,"first_server":"us","starters":' || replace(starters::text, '"oposto"', '"rei"') || '}'), array['23514']); -- função inválida
  perform private.t_fail(format('select public.start_set(%L,''nao-existe'',%L::jsonb)', ta, '{"number":1,"first_server":"us","starters":' || starters::text || '}'), array['P0002']);
  perform private.t_count(format('select count(*) from public.match_sets where team_id = %L', ta), 0); -- nada ficou gravado pelas falhas

  perform public.start_set(ta, 'm1', ('{"number":1,"first_server":"us","libero_id":"p7","starters":' || starters::text || '}')::jsonb);
  perform private.t_count(format('select count(*) from public.matches where team_id = %L and id = ''m1'' and status = ''em_andamento''', ta), 1);
  perform private.t_count(format('select count(*) from public.match_set_starters where team_id = %L and match_id = ''m1''', ta), 6);
  perform private.t_fail(format('select public.start_set(%L,''m1'',%L::jsonb)', ta, '{"number":2,"first_server":"us","starters":' || starters::text || '}'), array['40001']); -- set 1 ainda não terminou
  -- O formato fica travado depois do primeiro set
  perform private.t_fail(format('update public.matches set best_of = 5 where team_id = %L and id = ''m1''', ta), array['23514']);
  perform private.t_rows(format('update public.matches set venue = ''Outro ginásio'' where team_id = %L and id = ''m1''', ta), 1); -- o resto continua editável

  -- ───── pontuação, saque e rotação: set 1 = u u t u u u (5 a 1) ─────
  res := public.record_rally(ta, 'm1', '{"id":"r1","attempt_key":"a1","set_number":1,"expected_seq":1,"winner":"us"}'::jsonb);
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and id = ''r1'' and serving_side = ''us'' and rotation = 0 and server_player_id = ''p1''', ta), 1);
  if (res->>'duplicate')::boolean then raise exception 'primeiro registro nao e duplicado'; end if;
  -- Idempotência: o MESMO toque devolve o original e não duplica
  res := public.record_rally(ta, 'm1', '{"id":"r1b","attempt_key":"a1","set_number":1,"expected_seq":1,"winner":"us"}'::jsonb);
  if not (res->>'duplicate')::boolean or res->'rally'->>'id' <> 'r1' then raise exception 'idempotencia falhou: %', res; end if;
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m1''', ta), 1);
  -- Concorrência: outro cliente com a tela velha (mesmo número de ponto, chave diferente) é recusado
  perform private.t_fail(format('select public.record_rally(%L,''m1'',%L::jsonb)', ta, '{"id":"r1c","attempt_key":"a1c","set_number":1,"expected_seq":1,"winner":"them"}'), array['40001']);
  perform private.t_fail(format('select public.record_rally(%L,''m1'',%L::jsonb)', ta, '{"id":"r1c","attempt_key":"a1c","set_number":2,"expected_seq":2,"winner":"them"}'), array['40001']); -- set que não é o atual
  -- Razões incoerentes com quem sacava
  perform private.t_fail(format('select public.record_rally(%L,''m1'',%L::jsonb)', ta, '{"id":"rz","attempt_key":"az","set_number":1,"expected_seq":2,"winner":"them","reason":"ace"}'), array['P0001']); -- ace de quem não sacava
  perform private.t_fail(format('select public.record_rally(%L,''m1'',%L::jsonb)', ta, '{"id":"rz","attempt_key":"az","set_number":1,"expected_seq":2,"winner":"us","reason":"erro_saque"}'), array['P0001']);
  perform private.t_fail(format('select public.record_rally(%L,''m1'',%L::jsonb)', ta, '{"id":"rz","attempt_key":"az","set_number":1,"expected_seq":2,"winner":"them","reason":"erro_recepcao"}'), array['P0001']);
  perform private.t_fail(format('select public.record_rally(%L,''m1'',%L::jsonb)', ta, '{"id":"rz","attempt_key":"az","set_number":1,"expected_seq":2,"winner":"us","reason":"inventada"}'), array['23514']);
  perform private.t_fail(format('select public.record_rally(%L,''m1'',%L::jsonb)', ta, '{"id":"rz","attempt_key":"az","set_number":1,"expected_seq":2,"winner":"talvez"}'), array['P0001']);
  -- Jogador e sacador de outra equipe não entram (chave composta com team_id)
  -- (preparado mais abaixo, depois que a equipe B existir)

  -- rally 2 com ace + ação técnica ligada ao rally e ao atleta
  res := public.record_rally(ta, 'm1', '{"id":"r2","attempt_key":"a2","set_number":1,"expected_seq":2,"winner":"us","reason":"ace","player_id":"p1","actions":[{"id":"x1","attempt_key":"xa1","player_id":"p1","fundamental":"saque","outcome":"ace"}]}'::jsonb);
  perform private.t_count(format('select count(*) from public.rally_actions where team_id = %L and rally_id = ''r2'' and player_id = ''p1'' and voided_at is null', ta), 1);
  -- Ação inválida derruba o rally inteiro (transação): nada fica pela metade
  perform private.t_fail(format('select public.record_rally(%L,''m1'',%L::jsonb)', ta, '{"id":"r3","attempt_key":"a3","set_number":1,"expected_seq":3,"winner":"them","actions":[{"id":"x2","attempt_key":"xa2","player_id":"p1","fundamental":"saque","outcome":"A"}]}'), array['23514']);
  perform private.t_fail(format('select public.record_rally(%L,''m1'',%L::jsonb)', ta, '{"id":"r3","attempt_key":"a3","set_number":1,"expected_seq":3,"winner":"them","actions":[{"id":"x2","attempt_key":"xa1","player_id":"p1","fundamental":"saque","outcome":"erro"}]}'), array['23505']); -- chave de ação repetida
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m1''', ta), 2);

  perform private.t_play(ta, 'm1', 1, 't');   -- seq 3: adversário ganha o ponto (nós sacávamos)
  perform private.t_play(ta, 'm1', 1, 'u');   -- seq 4: o adversário sacava, nós ganhamos: side-out
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m1'' and seq = 3 and serving_side = ''us'' and winner_side = ''them'' and rotation = 0', ta), 1);
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m1'' and seq = 4 and serving_side = ''them'' and server_player_id is null and rotation = 0', ta), 1);
  perform private.t_play(ta, 'm1', 1, 'u');   -- seq 5: agora saca o jogador da posição 2 (rotação 1)
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m1'' and seq = 5 and serving_side = ''us'' and rotation = 1 and server_player_id = ''p2''', ta), 1);
  -- Desfazer o último ponto anula (não apaga) e libera o número
  perform private.t_fail(format('select public.void_last_rally(%L,''m1'',''r1'')', ta), array['40001']); -- não é o último
  v_last := private.t_last_rally(ta, 'm1', 1);
  perform public.void_last_rally(ta, 'm1', v_last);
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m1'' and set_number = 1', ta), 5); -- continua lá, anulado
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m1'' and set_number = 1 and voided_at is null', ta), 4);
  perform private.t_play(ta, 'm1', 1, 'uu');  -- seq 5 e 6 de novo: 5 a 1, o set fecha
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m1'' and set_number = 1 and voided_at is null and winner_side = ''us''', ta), 5);
  -- Set fechado: não aceita mais pontos; só desfazer
  perform private.t_fail(format('select public.record_rally(%L,''m1'',%L::jsonb)', ta, '{"id":"rf","attempt_key":"af","set_number":1,"expected_seq":7,"winner":"us"}'), array['P0001']);
  -- Rally e ação nunca são editados: nem pelo dono do banco (gatilho), e a anulação não se desfaz
  reset role;
  perform private.t_fail(format('update public.rallies set winner_side = ''them'' where team_id = %L and id = ''r1''', ta), array['23514']);
  perform private.t_fail(format('update public.rally_actions set outcome = ''erro'' where team_id = %L and id = ''x1''', ta), array['23514']);
  perform private.t_fail(format('update public.rallies set voided_at = null where team_id = %L and match_id = ''m1'' and voided_at is not null', ta), array['23514']);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;

  -- ───── set 2: começa sacando o adversário; a rotação recomeça em 0 ─────
  perform public.start_set(ta, 'm1', ('{"number":2,"first_server":"them","starters":' || starters::text || '}')::jsonb);
  perform private.t_play(ta, 'm1', 2, 'ututtuut'); -- 4 a 4
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m1'' and set_number = 2 and seq = 1 and serving_side = ''them'' and rotation = 0', ta), 1);
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m1'' and set_number = 2 and seq = 2 and serving_side = ''us'' and rotation = 1 and server_player_id = ''p2''', ta), 1);
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m1'' and set_number = 2 and seq = 5 and serving_side = ''them'' and rotation = 2', ta), 1); -- quem saca e ganha mantém a rotação
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m1'' and set_number = 2 and seq = 7 and serving_side = ''us'' and rotation = 3 and server_player_id = ''p4''', ta), 1);
  perform private.t_play(ta, 'm1', 2, 'u'); -- 5 a 4: ainda não fecha (falta a diferença de 2)
  perform private.t_play(ta, 'm1', 2, 't'); -- 5 a 5
  perform private.t_play(ta, 'm1', 2, 'u'); -- 6 a 5
  perform private.t_play(ta, 'm1', 2, 'u'); -- 7 a 5: fecha
  perform private.t_fail(format('select public.start_set(%L,''m1'',%L::jsonb)', ta, '{"number":3,"first_server":"us","starters":' || starters::text || '}'), array['P0001']); -- 2 a 0: partida decidida

  -- Desfazer reabre o set fechado
  v_last := private.t_last_rally(ta, 'm1', 2);
  perform public.void_last_rally(ta, 'm1', v_last);
  perform private.t_play(ta, 'm1', 2, 't'); -- 6 a 6: aberto
  perform private.t_play(ta, 'm1', 2, 'uu'); -- 8 a 6: fecha de novo

  -- ───── encerrar ─────
  perform private.t_fail(format('select public.conclude_match(%L,''nao-existe'')', ta), array['P0002']);
  res := public.conclude_match(ta, 'm1');
  if res->>'status' <> 'concluida' or (res->>'final_sets_us')::int <> 2 or (res->>'final_sets_them')::int <> 0 then
    raise exception 'resultado final errado: %', res;
  end if;
  perform private.t_fail(format('select public.conclude_match(%L,''m1'')', ta), array['P0001']); -- já concluída
  perform private.t_fail(format('select public.record_rally(%L,''m1'',%L::jsonb)', ta, '{"id":"rc","attempt_key":"ac","set_number":2,"expected_seq":9,"winner":"us"}'), array['P0001']);
  perform private.t_fail(format('select public.void_last_rally(%L,''m1'',%L)', ta, private.t_last_rally(ta, 'm1', 2)), array['P0001']);
  perform private.t_fail(format('select public.add_rally_action(%L,%L::jsonb)', ta, '{"id":"xz","attempt_key":"xz","rally_id":"r2","player_id":"p1","fundamental":"saque","outcome":"valido"}'), array['P0001']);
  -- Reabrir: só coach
  res := public.reopen_match(ta, 'm1');
  if res->>'status' <> 'em_andamento' or res->>'final_sets_us' is not null then raise exception 'reabrir falhou: %', res; end if;

  -- ───── ações técnicas avulsas: idempotência, inválidas, anulação ─────
  res := public.add_rally_action(ta, '{"id":"x3","attempt_key":"xa3","rally_id":"r2","player_id":"p2","fundamental":"ataque","outcome":"ponto"}'::jsonb);
  perform public.add_rally_action(ta, '{"id":"x3b","attempt_key":"xa3","rally_id":"r2","player_id":"p2","fundamental":"ataque","outcome":"ponto"}'::jsonb); -- repetida: devolve a original
  perform private.t_count(format('select count(*) from public.rally_actions where team_id = %L and rally_id = ''r2''', ta), 2);
  perform private.t_fail(format('select public.add_rally_action(%L,%L::jsonb)', ta, '{"id":"x4","attempt_key":"xa4","rally_id":"r2","player_id":"p2","fundamental":"ataque","outcome":"A"}'), array['23514']);
  perform private.t_fail(format('select public.add_rally_action(%L,%L::jsonb)', ta, '{"id":"x4","attempt_key":"xa4","rally_id":"nao-existe","player_id":"p2","fundamental":"ataque","outcome":"ponto"}'), array['P0002']);
  perform public.void_rally_action(ta, 'x3');
  perform private.t_count(format('select count(*) from public.rally_actions where team_id = %L and rally_id = ''r2'' and voided_at is null', ta), 1);
  perform private.t_fail(format('select public.void_rally_action(%L,''nao-existe'')', ta), array['P0002']);

  -- ───── cancelar set vazio ─────
  insert into public.matches (team_id, id, opponent, best_of, set_points, deciding_set_points, created_at, updated_at) values (ta, 'm3', 'Time C', 3, 5, 3, now(), now());
  perform public.start_set(ta, 'm3', ('{"number":1,"first_server":"us","starters":' || starters::text || '}')::jsonb);
  perform public.cancel_empty_set(ta, 'm3', 1);
  perform private.t_count(format('select count(*) from public.matches where team_id = %L and id = ''m3'' and status = ''agendada''', ta), 1);
  perform private.t_count(format('select count(*) from public.match_set_starters where team_id = %L and match_id = ''m3''', ta), 0); -- cascata
  perform public.start_set(ta, 'm3', ('{"number":1,"first_server":"us","starters":' || starters::text || '}')::jsonb);
  perform private.t_play(ta, 'm3', 1, 'u');
  perform public.void_last_rally(ta, 'm3', private.t_last_rally(ta, 'm3', 1));
  perform private.t_fail(format('select public.cancel_empty_set(%L,''m3'',1)', ta), array['P0001']); -- já teve registro (mesmo desfeito)
  perform private.t_fail(format('select public.conclude_match(%L,''nao-existe'')', ta), array['P0002']);
  insert into public.matches (team_id, id, opponent, created_at, updated_at) values (ta, 'm4', 'Time D', now(), now());
  perform private.t_fail(format('select public.conclude_match(%L,''m4'')', ta), array['P0001']); -- sem set iniciado

  -- ───── B: equipe separada; isolamento por equipe ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tb := public.create_team('Equipe B');
  insert into public.players (team_id, id, name, jersey_number, primary_position, created_at, updated_at) values (tb, 'pb', 'Bruna', 10, 'libero', now(), now());
  perform private.t_count('select count(*) from public.matches', 0);
  perform private.t_count('select count(*) from public.rallies', 0);
  perform private.t_count('select count(*) from public.rally_actions', 0);
  perform private.t_count('select count(*) from public.match_sets', 0);
  perform private.t_fail(format('select public.record_rally(%L,''m1'',%L::jsonb)', ta, '{"id":"rb","attempt_key":"ab","set_number":2,"expected_seq":9,"winner":"us"}'), array['42501']);
  perform private.t_fail(format('select public.start_set(%L,''m3'',%L::jsonb)', ta, '{"number":2,"first_server":"us","starters":' || starters::text || '}'), array['42501']);
  perform private.t_fail(format('select public.conclude_match(%L,''m1'')', ta), array['42501']);
  perform private.t_fail(format('select public.reopen_match(%L,''m1'')', ta), array['42501']);
  perform private.t_fail(format('select public.add_rally_action(%L,%L::jsonb)', ta, '{"id":"xb","attempt_key":"xb","rally_id":"r2","player_id":"p1","fundamental":"saque","outcome":"valido"}'), array['42501']);
  perform private.t_fail(format('select public.void_rally_action(%L,''x1'')', ta), array['42501']);
  perform private.t_fail(format('insert into public.matches (team_id,id,opponent,created_at,updated_at) values (%L,''mb'',''Intruso'',now(),now())', ta), array['42501']);
  perform private.t_rows(format('update public.matches set opponent = ''Hack'' where team_id = %L', ta), 0);
  perform private.t_rows(format('delete from public.matches where team_id = %L', ta), 0);
  -- B cria partida na própria equipe e NÃO consegue escalar atleta de A (integridade entre equipes)
  insert into public.matches (team_id, id, opponent, created_at, updated_at) values (tb, 'mb', 'Rivais B', now(), now());
  perform private.t_fail(format('select public.start_set(%L,''mb'',%L::jsonb)', tb, '{"number":1,"first_server":"us","starters":' || starters::text || '}'), array['23503']);

  -- ───── A convida C (analyst) e D (viewer) ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.add_team_member(ta, 'c@m.test', 'analyst');
  perform public.add_team_member(ta, 'd@m.test', 'viewer');

  -- Integridade entre equipes dentro do rally: jogador de B em rally de A
  perform private.t_fail(format('select public.record_rally(%L,''m3'',%L::jsonb)', ta, '{"id":"rcb","attempt_key":"acb","set_number":1,"expected_seq":1,"winner":"us","player_id":"pb"}'), array['23503']);
  perform private.t_fail(format('select public.record_rally(%L,''m3'',%L::jsonb)', ta, '{"id":"rcb","attempt_key":"acb","set_number":1,"expected_seq":1,"winner":"us","actions":[{"id":"xcb","attempt_key":"xcb","player_id":"pb","fundamental":"saque","outcome":"valido"}]}'), array['23503']);

  -- ───── C (analyst): registra partidas, mas não reabre nem apaga ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform private.t_count(format('select count(*) from public.matches where team_id = %L', ta), 3);
  insert into public.matches (team_id, id, opponent, best_of, set_points, deciding_set_points, created_at, updated_at) values (ta, 'm5', 'Time E', 3, 5, 3, now(), now());
  perform public.start_set(ta, 'm5', ('{"number":1,"first_server":"us","starters":' || starters::text || '}')::jsonb);
  perform private.t_play(ta, 'm5', 1, 'uuuuu');
  perform public.conclude_match(ta, 'm5');
  perform private.t_fail(format('select public.reopen_match(%L,''m5'')', ta), array['42501']);
  perform private.t_rows(format('delete from public.matches where team_id = %L and id = ''m5''', ta), 0); -- RLS: só coach apaga
  perform private.t_count(format('select count(*) from public.matches where team_id = %L and id = ''m5''', ta), 1);

  -- ───── D (viewer): só lê ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform private.t_count(format('select count(*) from public.matches where team_id = %L', ta), 4);
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m1''', ta) , 22);
  perform private.t_fail(format('insert into public.matches (team_id,id,opponent,created_at,updated_at) values (%L,''mv'',''Viewer'',now(),now())', ta), array['42501']);
  perform private.t_rows(format('update public.matches set opponent = ''Hack'' where team_id = %L', ta), 0);
  perform private.t_rows(format('delete from public.matches where team_id = %L', ta), 0);
  perform private.t_fail(format('select public.start_set(%L,''m4'',%L::jsonb)', ta, '{"number":1,"first_server":"us","starters":' || starters::text || '}'), array['42501']);
  perform private.t_fail(format('select public.record_rally(%L,''m3'',%L::jsonb)', ta, '{"id":"rv","attempt_key":"av","set_number":1,"expected_seq":1,"winner":"us"}'), array['42501']);
  perform private.t_fail(format('select public.void_last_rally(%L,''m3'',''x'')', ta), array['42501']);
  perform private.t_fail(format('select public.cancel_empty_set(%L,''m3'',1)', ta), array['42501']);
  perform private.t_fail(format('select public.conclude_match(%L,''m3'')', ta), array['42501']);
  perform private.t_fail(format('select public.add_rally_action(%L,%L::jsonb)', ta, '{"id":"xv","attempt_key":"xv","rally_id":"r2","player_id":"p1","fundamental":"saque","outcome":"valido"}'), array['42501']);
  perform private.t_fail(format('select public.void_rally_action(%L,''x1'')', ta), array['42501']);

  -- ───── A (coach) apaga uma partida: cascata leva sets, rallies e ações dela e só dela ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform private.t_rows(format('delete from public.matches where team_id = %L and id = ''m1''', ta), 1);
  perform private.t_count(format('select count(*) from public.match_sets where team_id = %L and match_id = ''m1''', ta), 0);
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m1''', ta), 0);
  perform private.t_count(format('select count(*) from public.rally_actions where team_id = %L and match_id = ''m1''', ta), 0);
  perform private.t_count(format('select count(*) from public.rallies where team_id = %L and match_id = ''m5''', ta), 5); -- a outra partida segue intacta
  -- Atleta que já tem registro de partida não se apaga (FK sem cascata): o histórico não se perde em silêncio
  perform private.t_fail(format('delete from public.players where team_id = %L and id = ''p1''', ta), array['23503']);

  reset role;
  raise exception 'TESTES_OK partidas: regras, idempotencia, concorrencia, papeis e isolamento por equipe';
end
$t$;
