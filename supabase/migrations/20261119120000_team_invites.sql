-- Alpha7: convites por código. Quem tem conta (criada no próprio app) entra numa equipe com um código gerado pelo coach.
--
-- * O código aparece UMA vez, na criação. O banco guarda só o hash (sha256 do código normalizado).
-- * Quem gera e lista convites é o coach. Ninguém escreve direto na tabela: só as funções abaixo.
-- * Resgatar exige login; 10 tentativas inválidas a cada 15 minutos por pessoa (depois disso, bloqueio temporário).
-- * Resposta de convite inválido é sempre a mesma (inexistente, expirado, revogado ou esgotado).
-- * Quem já é membro da equipe do convite não perde papel nem gasta um uso.

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  code_hash text not null unique,
  role text not null check (role in ('coach', 'analyst', 'viewer')),
  label text check (label is null or char_length(label) <= 60),
  max_uses int not null check (max_uses between 1 and 50),
  used_count int not null default 0 check (used_count >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (used_count <= max_uses)
);
create index team_invites_team_idx on public.team_invites (team_id);
create index team_invites_created_by_idx on public.team_invites (created_by);

alter table public.team_invites enable row level security;
create policy invites_select on public.team_invites for select to authenticated using (private.is_coach(team_id));

-- Privilégios mínimos: só leitura, sem a coluna do hash. Escrita só pelas funções.
revoke all on table public.team_invites from public, anon, authenticated;
grant select (id, team_id, role, label, max_uses, used_count, expires_at, revoked_at, created_at, created_by) on public.team_invites to authenticated;

-- Tentativas inválidas de resgate (schema private: fora da API REST).
create table private.invite_attempts (
  user_id uuid not null references auth.users (id) on delete cascade,
  attempted_at timestamptz not null default now()
);
create index invite_attempts_user_idx on private.invite_attempts (user_id, attempted_at);

create function private.invite_code_hash(p_code text) returns text
language sql immutable
set search_path = ''
as $$ select encode(sha256(convert_to(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')), 'UTF8')), 'hex') $$;

-- Cria um convite. Devolve o código (única vez em que ele existe em texto) e a validade.
create function public.create_team_invite(p_team uuid, p_role text, p_label text, p_valid_days int, p_max_uses int) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_raw text;
  v_code text;
  v_id uuid;
  v_expires timestamptz;
  v_label text := nullif(btrim(coalesce(p_label, '')), '');
  v_try int := 0;
begin
  if not private.is_coach(p_team) then
    raise exception 'Só a comissão técnica (coach) pode criar convites.' using errcode = '42501';
  end if;
  if p_role not in ('coach', 'analyst', 'viewer') then
    raise exception 'Papel inválido: use coach, analyst ou viewer.' using errcode = '22023';
  end if;
  if p_valid_days is null or p_valid_days not between 1 and 90 then
    raise exception 'A validade do convite deve ser de 1 a 90 dias.' using errcode = '22023';
  end if;
  if p_max_uses is null or p_max_uses not between 1 and 50 then
    raise exception 'O número de usos deve ser de 1 a 50.' using errcode = '22023';
  end if;
  if v_label is not null and char_length(v_label) > 60 then
    raise exception 'O rótulo pode ter até 60 caracteres.' using errcode = '22023';
  end if;
  v_expires := now() + make_interval(days => p_valid_days);
  loop
    v_try := v_try + 1;
    v_raw := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
    begin
      insert into public.team_invites (team_id, code_hash, role, label, max_uses, expires_at, created_by)
        values (p_team, private.invite_code_hash(v_raw), p_role, v_label, p_max_uses, v_expires, v_user)
        returning id into v_id;
      exit;
    exception when unique_violation then
      if v_try >= 5 then raise; end if;
    end;
  end loop;
  v_code := substr(v_raw, 1, 4) || '-' || substr(v_raw, 5, 4) || '-' || substr(v_raw, 9, 4);
  return jsonb_build_object('id', v_id, 'code', v_code, 'expires_at', v_expires);
end;
$$;

-- Resgata um convite para a pessoa logada. Devolve {ok, team_id, role, already} ou {ok:false, reason: 'invalid'|'throttled'}.
-- Convite inválido NÃO levanta exceção de propósito: a exceção desfaria o registro da tentativa.
create function public.redeem_team_invite(p_code text) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_user uuid := (select auth.uid());
  v_hash text := private.invite_code_hash(p_code);
  v_len int := char_length(upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')));
  inv public.team_invites;
  v_role text;
begin
  if v_user is null then
    raise exception 'Entre com seu e-mail para usar um convite.' using errcode = '28000';
  end if;
  delete from private.invite_attempts where attempted_at < now() - interval '1 day';
  if (select count(*) from private.invite_attempts where user_id = v_user and attempted_at > now() - interval '15 minutes') >= 10 then
    return jsonb_build_object('ok', false, 'reason', 'throttled');
  end if;
  if v_len <> 12 then
    insert into private.invite_attempts (user_id) values (v_user);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  select * into inv from public.team_invites where code_hash = v_hash for update;
  if not found then
    insert into private.invite_attempts (user_id) values (v_user);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  -- Quem já é membro (abriu o link duas vezes, ou é da comissão técnica) vê "já está na equipe", mesmo com o convite esgotado.
  select m.role into v_role from public.team_members m where m.team_id = inv.team_id and m.user_id = v_user;
  if v_role is not null then
    return jsonb_build_object('ok', true, 'team_id', inv.team_id, 'role', v_role, 'already', true);
  end if;
  if inv.revoked_at is not null or inv.expires_at <= now() or inv.used_count >= inv.max_uses then
    insert into private.invite_attempts (user_id) values (v_user);
    return jsonb_build_object('ok', false, 'reason', 'invalid');
  end if;
  insert into public.team_members (team_id, user_id, role) values (inv.team_id, v_user, inv.role);
  update public.team_invites set used_count = used_count + 1 where id = inv.id;
  return jsonb_build_object('ok', true, 'team_id', inv.team_id, 'role', inv.role, 'already', false);
end;
$$;

-- Revoga um convite (não apaga: fica no histórico da equipe). Só coach.
create function public.revoke_team_invite(p_team uuid, p_invite uuid) returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not private.is_coach(p_team) then
    raise exception 'Só a comissão técnica (coach) pode revogar convites.' using errcode = '42501';
  end if;
  update public.team_invites set revoked_at = coalesce(revoked_at, now()) where team_id = p_team and id = p_invite;
  if not found then raise exception 'O convite não existe.' using errcode = 'P0002'; end if;
end;
$$;

revoke execute on function
  public.create_team_invite(uuid, text, text, int, int), public.redeem_team_invite(text), public.revoke_team_invite(uuid, uuid)
  from public, anon;
grant execute on function
  public.create_team_invite(uuid, text, text, int, int), public.redeem_team_invite(text), public.revoke_team_invite(uuid, uuid)
  to authenticated;
revoke execute on function private.invite_code_hash(text) from public, anon, authenticated;
