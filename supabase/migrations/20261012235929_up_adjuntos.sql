insert into storage.buckets (id, name, public, file_size_limit) values ('up-adjuntos', 'up-adjuntos', false, 104857600);
create policy "dueña lee sus adjuntos de UP" on storage.objects for select to authenticated
  using (bucket_id = 'up-adjuntos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "dueña sube sus adjuntos de UP" on storage.objects for insert to authenticated
  with check (bucket_id = 'up-adjuntos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "dueña borra sus adjuntos de UP" on storage.objects for delete to authenticated
  using (bucket_id = 'up-adjuntos' and (storage.foldername(name))[1] = (select auth.uid())::text);
alter table public.up_piezas add column adjuntos jsonb not null default '[]'::jsonb;;
