-- servicio tenia RLS activo pero solo una policy de SELECT (lectura abierta).
-- Faltaban policies de escritura, por lo que el CRUD de admin daba
-- "new row violates row-level security policy". Se agregan INSERT/UPDATE/DELETE
-- restringidas a administradores, usando el helper mi_rol() (convencion del proyecto).

create policy servicio_insert on public.servicio
  for insert to authenticated
  with check (mi_rol() = 'administrador'::rol_usuario);

create policy servicio_update on public.servicio
  for update to authenticated
  using      (mi_rol() = 'administrador'::rol_usuario)
  with check (mi_rol() = 'administrador'::rol_usuario);

create policy servicio_delete on public.servicio
  for delete to authenticated
  using (mi_rol() = 'administrador'::rol_usuario);
