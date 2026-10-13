-- Fotos dos atletas (0.6.0). MIGRAÇÃO ADITIVA: uma coluna nova, um bucket novo e políticas novas; nada existente muda.
--
-- Decisões:
-- * A foto é UM arquivo por atleta no bucket PRIVADO `player-photos`, em `{team_id}/{player_id}-{versão}.jpg`.
--   `players.photo_path` guarda esse caminho: é a única referência. Tela, carta, perfil, escalação e arte
--   usam o mesmo arquivo (nunca cópias).
-- * Leitura: qualquer pessoa da equipe (papéis coach, analyst e viewer), por URL assinada de curta duração.
-- * Escrita (enviar, substituir, remover): só coach, e só dentro da pasta da própria equipe.
-- * O caminho precisa começar pela equipe do atleta (restrição CHECK) e o bucket aceita só JPEG/PNG/WebP até 1 MB.

alter table public.players
  add column photo_path text
  check (photo_path is null or (char_length(photo_path) <= 200 and photo_path like team_id::text || '/%'));

-- Pasta (primeiro trecho do caminho) como uuid de equipe; null quando não for um uuid (a política então nega).
create function private.photo_team(p_name text) returns uuid
language plpgsql immutable set search_path = ''
as $$
begin
  return ((storage.foldername(p_name))[1])::uuid;
exception when others then
  return null;
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('player-photos', 'player-photos', false, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy player_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'player-photos' and private.is_member(private.photo_team(name)));
create policy player_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'player-photos' and private.is_coach(private.photo_team(name)));
create policy player_photos_update on storage.objects for update to authenticated
  using (bucket_id = 'player-photos' and private.is_coach(private.photo_team(name)))
  with check (bucket_id = 'player-photos' and private.is_coach(private.photo_team(name)));
create policy player_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'player-photos' and private.is_coach(private.photo_team(name)));
