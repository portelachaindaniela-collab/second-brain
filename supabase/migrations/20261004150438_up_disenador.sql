alter table public.up_piezas add column assets_texto text;

insert into storage.buckets (id, name, public) values ('up-assets', 'up-assets', true);

select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'up_disenador_secreto', 'GitHub Action del diseñador de UP (secret UP_DISENADOR_SECRETO del repo second-brain).');

create function public.up_disenador_secreto_valido(p_secreto text)
returns boolean language sql stable security definer set search_path to ''
as $$
  select coalesce(p_secreto <> '' and exists (
    select 1 from vault.decrypted_secrets where name = 'up_disenador_secreto' and decrypted_secret = p_secreto
  ), false)
$$;
revoke execute on function public.up_disenador_secreto_valido(text) from public, anon, authenticated;
grant execute on function public.up_disenador_secreto_valido(text) to service_role;;
