-- La app de SB en el celular también manda su ubicación (al abrirse y con el botón), con la sesión de la dueña.
create policy "dueña manda su ubicación desde la app" on public.ubicaciones for insert to authenticated
  with check (owner_id = (select auth.uid()) and motivo in ('manual', 'periodico'));
