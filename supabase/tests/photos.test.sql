-- Testes das fotos dos atletas no PostgreSQL REAL (migração 20261014120000_player_photos).
-- Rode o arquivo inteiro DEPOIS de aplicar a migração. Termina SEMPRE com exceção (desfaz tudo):
--   * "TESTES_OK ..." → tudo passou;  * qualquer outra mensagem → a verificação que falhou.

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

create function private.t_count(p_sql text, p_expected int) returns void language plpgsql as $f$
declare n int;
begin
  execute p_sql into n;
  if n <> p_expected then raise exception 'CONTAGEM % (esperado %): %', n, p_expected, p_sql; end if;
end
$f$;

do $t$
declare
  ua uuid := gen_random_uuid(); -- coach de A
  ub uuid := gen_random_uuid(); -- coach de B
  uc uuid := gen_random_uuid(); -- analyst de A
  ud uuid := gen_random_uuid(); -- viewer de A
  who uuid;
  ta uuid;
  tb uuid;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'a@f.test', 'authenticated', 'authenticated'), (ub, 'b@f.test', 'authenticated', 'authenticated'),
    (uc, 'c@f.test', 'authenticated', 'authenticated'), (ud, 'd@f.test', 'authenticated', 'authenticated');

  -- O Supabase bloqueia DELETE direto em storage.objects (o app apaga pela API do Storage, que obedece à mesma política).
  -- Só dentro desta transação de teste liberamos, para provar a política de exclusão.
  perform set_config('storage.allow_delete_query', 'true', true);
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ta := public.create_team('Equipe A');
  insert into public.players (team_id, id, name, jersey_number, primary_position, created_at, updated_at)
    values (ta, 'p1', 'Ana Alves', 1, 'ponteiro', now(), now());
  -- o caminho da foto precisa começar pela equipe do atleta
  perform private.t_fail(format('update public.players set photo_path = %L where team_id = %L and id = ''p1''', 'outra-pasta/p1-1.jpg', ta), array['23514']);
  perform private.t_fail(format('update public.players set photo_path = %L where team_id = %L and id = ''p1''', gen_random_uuid()::text || '/p1-1.jpg', ta), array['23514']);
  update public.players set photo_path = ta::text || '/p1-1.jpg' where team_id = ta and id = 'p1';

  -- coach envia, lê, substitui e remove na pasta da própria equipe
  insert into storage.objects (bucket_id, name, owner, metadata) values ('player-photos', ta::text || '/p1-1.jpg', ua, '{"mimetype":"image/jpeg"}');
  perform private.t_count(format('select count(*) from storage.objects where bucket_id = ''player-photos'' and name like %L', ta::text || '/%'), 1);
  insert into storage.objects (bucket_id, name, owner, metadata) values ('player-photos', ta::text || '/p1-2.jpg', ua, '{"mimetype":"image/jpeg"}');
  delete from storage.objects where bucket_id = 'player-photos' and name = ta::text || '/p1-1.jpg';
  perform private.t_count(format('select count(*) from storage.objects where bucket_id = ''player-photos'' and name like %L', ta::text || '/%'), 1);
  -- fora da pasta de uma equipe sua: recusado
  perform private.t_fail(format('insert into storage.objects (bucket_id, name, owner) values (''player-photos'', %L, %L)', 'solto.jpg', ua), array['42501']);
  perform private.t_fail(format('insert into storage.objects (bucket_id, name, owner) values (''player-photos'', %L, %L)', gen_random_uuid()::text || '/x.jpg', ua), array['42501']);

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  tb := public.create_team('Equipe B');
  -- B não vê, não troca, não apaga e não escreve na pasta de A
  perform private.t_count(format('select count(*) from storage.objects where bucket_id = ''player-photos'' and name like %L', ta::text || '/%'), 0);
  perform private.t_fail(format('insert into storage.objects (bucket_id, name, owner) values (''player-photos'', %L, %L)', ta::text || '/intruso.jpg', ub), array['42501']);
  delete from storage.objects where bucket_id = 'player-photos' and name like ta::text || '/%';
  update storage.objects set name = ta::text || '/p1-9.jpg' where bucket_id = 'player-photos' and name like ta::text || '/%';
  insert into storage.objects (bucket_id, name, owner) values ('player-photos', tb::text || '/pb-1.jpg', ub); -- na própria pasta, pode
  perform private.t_count(format('select count(*) from storage.objects where bucket_id = ''player-photos'' and name like %L', tb::text || '/%'), 1);

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.add_team_member(ta, 'c@f.test', 'analyst');
  perform public.add_team_member(ta, 'd@f.test', 'viewer');

  -- analyst e viewer: leem a foto da própria equipe, mas não escrevem nada
  foreach who in array array[uc, ud] loop
    reset role;
    perform set_config('request.jwt.claims', json_build_object('sub', who, 'role', 'authenticated')::text, true);
    set local role authenticated;
    perform private.t_count(format('select count(*) from storage.objects where bucket_id = ''player-photos'' and name like %L', ta::text || '/%'), 1);
    perform private.t_fail(format('insert into storage.objects (bucket_id, name, owner) values (''player-photos'', %L, %L)', ta::text || '/novo.jpg', who), array['42501']);
    delete from storage.objects where bucket_id = 'player-photos' and name like ta::text || '/%';
    update storage.objects set name = ta::text || '/trocado.jpg' where bucket_id = 'player-photos' and name like ta::text || '/%';
    perform private.t_count(format('select count(*) from storage.objects where bucket_id = ''player-photos'' and name = %L', ta::text || '/p1-2.jpg'), 1); -- continua lá: a RLS escondeu a linha da exclusão e da troca
  end loop;

  reset role;
  -- o bucket é privado, limitado e restrito a imagens
  perform private.t_count('select count(*) from storage.buckets where id = ''player-photos'' and public = false and file_size_limit = 1048576 and allowed_mime_types @> array[''image/jpeg'']', 1);
  raise exception 'TESTES_OK fotos: caminho da equipe, coach escreve, analyst/viewer só leem, outra equipe nada';
end
$t$;
