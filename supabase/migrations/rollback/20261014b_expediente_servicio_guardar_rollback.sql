-- Rollback de `20261014b_expediente_servicio_guardar.sql`.
--
-- Sin pérdida de datos: solo retira la función. Los servicios ya guardados se
-- quedan en `expediente_servicio`.

drop function if exists public.guardar_servicios_expediente(uuid, int[]);

notify pgrst, 'reload schema';
