-- `archivo_select` cortaba al constructor en 'estimado'/'en_oferta', mientras que
-- expediente_select y localizacion_select lo dejan seguir hasta 'contratado'.
-- Resultado: en cuanto se adjudicaba, el constructor que ejecuta la obra perdía
-- las fotos y documentos del expediente (solo conservaba los que subió él).
-- Se añaden dos ramas acotadas al titular real del trabajo:
--   · expediente adjudicado/contratado y contrato u oferta aceptada suya;
--   · archivos de reportes diarios del seguimiento de obra que le pertenece.
-- No se amplía a los constructores que no ganaron: fuera de 'estimado'/'en_oferta'
-- solo entra el adjudicado.

drop policy if exists "archivo_select" on public.archivo;

create policy "archivo_select" on public.archivo
  for select to authenticated
  using (
    subido_por = auth.uid()
    or mi_rol() = any (array['estimador'::rol_usuario, 'administrador'::rol_usuario])
    or (
      expediente_id is not null and exists (
        select 1 from expediente e
        where e.id = archivo.expediente_id
          and (
            e.cliente_id = auth.uid()
            or (
              mi_rol() = 'constructor'::rol_usuario
              and e.estado = any (array['estimado'::estado_expediente, 'en_oferta'::estado_expediente])
              and constructor_puede_ver_expediente(e.id)
            )
            or (
              mi_rol() = 'constructor'::rol_usuario
              and e.estado = any (array['adjudicado'::estado_expediente, 'contratado'::estado_expediente])
              and (
                exists (
                  select 1 from contrato c
                  where c.expediente_id = e.id and c.constructor_id = auth.uid()
                )
                or exists (
                  select 1 from oferta o
                  where o.expediente_id = e.id
                    and o.constructor_id = auth.uid()
                    and o.estado = 'aceptada'::estado_oferta
                )
              )
            )
          )
      )
    )
    or (
      oferta_id is not null and exists (
        select 1 from oferta o
        where o.id = archivo.oferta_id
          and (
            o.constructor_id = auth.uid()
            or exists (
              select 1 from expediente e
              where e.id = o.expediente_id and e.cliente_id = auth.uid()
            )
          )
      )
    )
    or (
      reporte_id is not null and exists (
        select 1
        from reporte_diario r
        join seguimiento_obra s on s.id = r.seguimiento_id
        join expediente e on e.id = s.expediente_id
        where r.id = archivo.reporte_id
          and (e.cliente_id = auth.uid() or s.constructor_id = auth.uid())
      )
    )
  );
