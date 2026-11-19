-- Testes dos convites por código (migração 20261119120000_team_invites).
--
-- Como rodar: execute este arquivo inteiro no SQL do projeto (ou via MCP execute_sql), DEPOIS da migração. Ele cria
-- usuários e equipes de teste, simula cada papel e TERMINA SEMPRE com uma exceção, o que desfaz tudo:
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

create function private.t_count(p_sql text, p_expected int) returns void language plpgsql as $f$
declare n int;
begin
  execute p_sql into n;
  if n <> p_expected then raise exception 'CONTAGEM % (esperado %): %', n, p_expected, p_sql; end if;
end
$f$;

create function private.t_json(p_actual jsonb, p_key text, p_expected text) returns void language plpgsql as $f$
begin
  if (p_actual ->> p_key) is distinct from p_expected then
    raise exception 'JSON % = % (esperado %) :: %', p_key, p_actual ->> p_key, p_expected, p_actual;
  end if;
end
$f$;

do $t$
declare
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  uc uuid := gen_random_uuid();
  ud uuid := gen_random_uuid();
  ue uuid := gen_random_uuid();
  ta uuid;
  r jsonb;
  c1 text; c2 text; c3 text; c4 text;
  i4 uuid;
  n int;
begin
  insert into auth.users (id, email, aud, role) values
    (ua, 'a@t.test', 'authenticated', 'authenticated'),
    (ub, 'b@t.test', 'authenticated', 'authenticated'),
    (uc, 'c@t.test', 'authenticated', 'authenticated'),
    (ud, 'd@t.test', 'authenticated', 'authenticated'),
    (ue, 'e@t.test', 'authenticated', 'authenticated');

  -- ───── A cria a equipe e os convites ─────
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  ta := public.create_team('Equipe A');

  r := public.create_team_invite(ta, 'viewer', '  Bia  ', 7, 1);
  c1 := r ->> 'code';
  if c1 !~ '^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$' then raise exception 'FORMATO_DO_CODIGO: %', c1; end if;
  perform private.t_count(format('select count(*) from public.team_invites where team_id = %L and label = ''Bia''', ta), 1); -- rótulo aparado

  -- o hash nunca é legível pela API; o coach não escreve direto na tabela
  perform private.t_fail('select code_hash from public.team_invites', array['42501']);
  perform private.t_fail(format('insert into public.team_invites (team_id, code_hash, role, max_uses, expires_at) values (%L, ''x'', ''viewer'', 1, now() + interval ''1 day'')', ta), array['42501']);
  perform private.t_fail(format('update public.team_invites set max_uses = 50 where team_id = %L', ta), array['42501']);
  perform private.t_fail(format('delete from public.team_invites where team_id = %L', ta), array['42501']);

  -- parâmetros inválidos
  perform private.t_fail(format('select public.create_team_invite(%L, ''admin'', null, 7, 1)', ta), array['22023']);
  perform private.t_fail(format('select public.create_team_invite(%L, ''viewer'', null, 0, 1)', ta), array['22023']);
  perform private.t_fail(format('select public.create_team_invite(%L, ''viewer'', null, 91, 1)', ta), array['22023']);
  perform private.t_fail(format('select public.create_team_invite(%L, ''viewer'', null, 7, 0)', ta), array['22023']);
  perform private.t_fail(format('select public.create_team_invite(%L, ''viewer'', null, 7, 51)', ta), array['22023']);
  perform private.t_fail(format('select public.create_team_invite(%L, ''viewer'', %L, 7, 1)', ta, repeat('x', 61)), array['22023']);

  r := public.create_team_invite(ta, 'viewer', null, 7, 5);
  c2 := r ->> 'code';
  r := public.create_team_invite(ta, 'analyst', null, 7, 1);
  c3 := r ->> 'code';
  r := public.create_team_invite(ta, 'viewer', null, 7, 1);
  c4 := r ->> 'code';
  i4 := (r ->> 'id')::uuid;

  -- coach que resgata convite da própria equipe: continua coach e não gasta uso
  r := public.redeem_team_invite(c2);
  perform private.t_json(r, 'ok', 'true');
  perform private.t_json(r, 'already', 'true');
  perform private.t_json(r, 'role', 'coach');
  perform private.t_count(format('select count(*) from public.team_invites where team_id = %L and used_count > 0', ta), 0);

  -- ───── B (sem equipe): não cria, não lista, não revoga ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform private.t_fail(format('select public.create_team_invite(%L, ''coach'', null, 7, 1)', ta), array['42501']);
  perform private.t_fail(format('select public.revoke_team_invite(%L, %L)', ta, i4), array['42501']);
  perform private.t_count('select count(*) from public.team_invites', 0);

  -- B resgata c1 em minúsculas, com espaços e sem hífens: entra como viewer
  r := public.redeem_team_invite(lower(replace(c1, '-', ' ')));
  perform private.t_json(r, 'ok', 'true');
  perform private.t_json(r, 'role', 'viewer');
  perform private.t_json(r, 'already', 'false');
  perform private.t_count(format('select count(*) from public.team_members where team_id = %L and user_id = %L and role = ''viewer''', ta, ub), 1);
  perform private.t_count(format('select count(*) from public.players where team_id = %L', ta), 0); -- enxerga a equipe (vazia), sem erro
  -- viewer não lê a lista de convites
  perform private.t_count('select count(*) from public.team_invites', 0);
  -- de novo: já é membro, nada muda
  r := public.redeem_team_invite(c1);
  perform private.t_json(r, 'already', 'true');

  -- ───── C: convite esgotado, expirado, revogado e inexistente respondem igual ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.redeem_team_invite(c1); -- c1 tinha 1 uso e B gastou
  perform private.t_json(r, 'ok', 'false');
  perform private.t_json(r, 'reason', 'invalid');

  reset role;
  update public.team_invites set expires_at = now() - interval '1 minute' where code_hash = private.invite_code_hash(c3);
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.redeem_team_invite(c3); -- expirado
  perform private.t_json(r, 'reason', 'invalid');

  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.revoke_team_invite(ta, i4);
  perform public.revoke_team_invite(ta, i4); -- repetir é inofensivo
  perform private.t_fail(format('select public.revoke_team_invite(%L, %L)', ta, gen_random_uuid()), array['P0002']);
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.redeem_team_invite(c4); -- revogado
  perform private.t_json(r, 'reason', 'invalid');
  r := public.redeem_team_invite('ABCD-EF01-2345'); -- inexistente
  perform private.t_json(r, 'reason', 'invalid');
  perform private.t_count(format('select count(*) from public.team_members where team_id = %L and user_id = %L', ta, uc), 0);

  -- ───── D: limite de tentativas inválidas ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  set local role authenticated;
  for n in 1..10 loop
    r := public.redeem_team_invite('0000-0000-00' || lpad(n::text, 2, '0'));
    perform private.t_json(r, 'reason', 'invalid');
  end loop;
  r := public.redeem_team_invite(c2); -- convite BOM, mas a pessoa está bloqueada
  perform private.t_json(r, 'ok', 'false');
  perform private.t_json(r, 'reason', 'throttled');
  perform private.t_count(format('select count(*) from public.team_members where team_id = %L and user_id = %L', ta, ud), 0);
  -- passada a janela de 15 minutos, volta a funcionar
  reset role;
  update private.invite_attempts set attempted_at = now() - interval '20 minutes' where user_id = ud;
  perform set_config('request.jwt.claims', json_build_object('sub', ud, 'role', 'authenticated')::text, true);
  set local role authenticated;
  r := public.redeem_team_invite(c2);
  perform private.t_json(r, 'ok', 'true');
  perform private.t_json(r, 'role', 'viewer');

  -- o uso foi contado (A vê 1 uso em c2, 1 em c1)
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform private.t_count(format('select count(*) from public.team_invites where team_id = %L and used_count = 1', ta), 2);
  perform private.t_count(format('select count(*) from public.team_members where team_id = %L', ta), 3);

  -- ───── E: coach de outra equipe não vê nem usa os convites de A ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('sub', ue, 'role', 'authenticated')::text, true);
  set local role authenticated;
  perform public.create_team('Equipe E');
  perform private.t_count('select count(*) from public.team_invites', 0);
  perform private.t_fail(format('select public.create_team_invite(%L, ''viewer'', null, 7, 1)', ta), array['42501']);

  -- ───── anon: nada ─────
  reset role;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    perform public.redeem_team_invite(c2);
    raise exception 'DEVERIA_FALHAR: anon resgatou convite';
  exception when insufficient_privilege then null;
  end;
  begin
    perform count(*) from public.team_invites;
    raise exception 'DEVERIA_FALHAR: anon leu convites';
  exception when insufficient_privilege then null;
  end;

  raise exception 'TESTES_OK: convites (criar, resgatar, revogar, expirar, esgotar, já membro, limite de tentativas, hash invisível, isolamento entre equipes)';
end
$t$;
