-- Una sola conversación por agente con Daniela, guardada: lo que se hablan por chat, lo que le dice en el pasillo y lo
-- que se dicen en las reuniones (lugar). oficina-chat la lee entera, así nada queda aislado.
create table public.oficina_conversacion (
  id bigint generated always as identity primary key,
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agente text not null check (agente ~ '^(trabajadores|up|pdg|sistemas|admin):[a-z_]{1,40}$'),
  de text not null check (de in ('daniela', 'agente')),
  texto text not null check (length(texto) between 1 and 4000),
  lugar text not null default 'charla' check (lugar in ('charla', 'pasillo', 'reunion')),
  creado timestamptz not null default now()
);
create index oficina_conversacion_agente on public.oficina_conversacion (owner_id, agente, creado desc);
alter table public.oficina_conversacion enable row level security;
create policy "conversacion dueña" on public.oficina_conversacion for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Lo que ya se guardó del pasillo pasa a la conversación (oficina_encuentros queda sin uso).
insert into public.oficina_conversacion (owner_id, agente, de, texto, lugar, creado)
  select owner_id, agente, 'agente', texto, 'pasillo', creado from public.oficina_encuentros;
insert into public.oficina_conversacion (owner_id, agente, de, texto, lugar, creado)
  select owner_id, agente, 'daniela',
    case respuesta when 'ahora_no' then 'Ahora no.' when 'hablemos' then 'Hablemos.' when 'aprobada' then 'Dale, aprobado.' else 'No.' end,
    'pasillo', coalesce(respondido, creado)
  from public.oficina_encuentros where respuesta is not null;
