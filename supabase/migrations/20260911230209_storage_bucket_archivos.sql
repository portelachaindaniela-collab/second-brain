insert into storage.buckets (id, name, public)
values ('archivos', 'archivos', false)
on conflict (id) do nothing;

create policy "archivos propios lectura" on storage.objects for select
  using (bucket_id = 'archivos' and owner = auth.uid());
create policy "archivos propios alta" on storage.objects for insert
  with check (bucket_id = 'archivos' and owner = auth.uid());
create policy "archivos propios baja" on storage.objects for delete
  using (bucket_id = 'archivos' and owner = auth.uid());;
