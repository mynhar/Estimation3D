-- Rollback de 20261104e_expediente_video_constructor.sql
--
-- Vuelve a «sólo el estimador se presenta en el expediente». Los enlaces de
-- los constructores se borran (sus videos siguen en su biblioteca); los de
-- los estimadores se conservan.

delete from public.expediente_video ev
 using public.perfil p
 where p.id = ev.perfil_id
   and p.rol is distinct from 'estimador';

do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'expediente_video'
                and column_name = 'perfil_id') then
    alter table public.expediente_video rename column perfil_id to estimador_id;
  end if;
  if exists (select 1 from pg_constraint where conname = 'expediente_video_perfil_id_fkey') then
    alter table public.expediente_video
      rename constraint expediente_video_perfil_id_fkey to expediente_video_estimador_id_fkey;
  end if;
end;
$$;

comment on table public.expediente_video is
  'Video de presentación (perfil_video) con el que un estimador se presenta en un expediente.';

-- Políticas de 20261104c.
drop policy if exists expediente_video_select on public.expediente_video;
create policy expediente_video_select on public.expediente_video
  for select to authenticated
  using (public.mi_rol() = 'administrador' or estimador_id = (select auth.uid()));

drop policy if exists expediente_video_insert on public.expediente_video;
create policy expediente_video_insert on public.expediente_video
  for insert to authenticated
  with check (
    public.mi_rol() = 'administrador'
    or (
      public.mi_rol() = 'estimador'
      and estimador_id = (select auth.uid())
      and public.fn_estimador_de_expediente(expediente_id)
    )
  );

drop policy if exists expediente_video_update on public.expediente_video;
create policy expediente_video_update on public.expediente_video
  for update to authenticated
  using (
    public.mi_rol() = 'administrador'
    or (public.mi_rol() = 'estimador' and estimador_id = (select auth.uid()))
  )
  with check (
    public.mi_rol() = 'administrador'
    or (
      public.mi_rol() = 'estimador'
      and estimador_id = (select auth.uid())
      and public.fn_estimador_de_expediente(expediente_id)
    )
  );

drop policy if exists expediente_video_delete on public.expediente_video;
create policy expediente_video_delete on public.expediente_video
  for delete to authenticated
  using (
    public.mi_rol() = 'administrador'
    or (public.mi_rol() = 'estimador' and estimador_id = (select auth.uid()))
  );
