create table pantallas (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre      text not null,
  url         text not null,
  grupo       text not null default 'otros' check (grupo in ('redes','proyectos','herramientas','otros')),
  orden       int not null default 0,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

alter table pantallas enable row level security;
create policy "propias" on pantallas for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

insert into pantallas (owner_id, nombre, url, grupo, orden)
select u.id, v.nombre, v.url, v.grupo, v.orden
from auth.users u,
(values
  ('Instagram', 'https://www.instagram.com/', 'redes', 1),
  ('X', 'https://x.com/home', 'redes', 2),
  ('LinkedIn', 'https://www.linkedin.com/feed/', 'redes', 3),
  ('Point Data Global', 'https://pointdataglobal.netlify.app', 'proyectos', 1),
  ('Primera A Fem', 'https://primeraafem.netlify.app', 'proyectos', 2),
  ('ODBA', 'https://odba.netlify.app', 'proyectos', 3),
  ('Creando Sentido', 'https://creandosentido.netlify.app', 'proyectos', 4),
  ('Orientador Morón', 'https://orientadorvirtual-moron.netlify.app', 'proyectos', 5),
  ('Certifind', 'https://certifind.netlify.app', 'proyectos', 6),
  ('Mi web', 'https://danielaportelachain.netlify.app', 'proyectos', 7),
  ('Netlify', 'https://app.netlify.com', 'herramientas', 1),
  ('Supabase', 'https://supabase.com/dashboard', 'herramientas', 2)
) as v(nombre, url, grupo, orden)
where u.email = '<EMAIL_DUEÑA>';;
