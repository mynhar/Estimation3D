# Notas técnicas — comportamientos conocidos no visibles en la interfaz

> Registro de comportamientos verificados contra el código y contra el proyecto
> Supabase en producción (`ckdksfvxjimxuqceoeyr`) que **no** se explican en
> ninguna pantalla. No son bugs pendientes de arreglo salvo donde se indica; el
> objetivo es que el manual de usuario y el soporte no los descubran en caliente.
>
> Última verificación: 2026-08-10.

---

## 1. Edge function `test-resend` — retirada, aún desplegada

| | |
|---|---|
| Slug | `test-resend` (versión 4, `ACTIVE`, `verify_jwt: true`) |
| Estado real | Neutralizada: responde **410 Gone** con `{"error":"Función de prueba retirada"}` |
| Código fuente | Solo en producción; **no** existe en `supabase/functions/` |

Era una función de prueba del envío por Resend. Su cuerpo se sustituyó por un
*stub* que devuelve 410, así que ya no envía correos ni lee `RESEND_API_KEY`,
pero **sigue apareciendo** en la lista de Edge Functions del dashboard.

**Acción pendiente (manual):** eliminarla desde
*Supabase → Edge Functions → `test-resend` → Delete*. No se puede borrar por
migración ni desde el repositorio.

---

## 2. El correo de invitación a constructores está solo en español

La función `enviar-invitacion` sí devuelve sus errores con código traducible
(contrato `{ code, error, detail? }`), pero **el correo que recibe el
constructor no está internacionalizado**:

- [`supabase/functions/enviar-invitacion/index.ts:274`](../supabase/functions/enviar-invitacion/index.ts#L274) — `correoHtml()` emite `<html lang="es">` y todo el copy en español.
- [`supabase/functions/enviar-invitacion/index.ts:226-243`](../supabase/functions/enviar-invitacion/index.ts#L226-L243) — `fmtFecha()` y `fmtHora()` formatean con `Intl.DateTimeFormat('es-CA', …)` sobre el huso `America/Toronto`.

Consecuencias:

1. El destinatario recibe el mensaje en español aunque el administrador tenga la
   aplicación en francés o inglés, y aunque el idioma por defecto del producto
   sea **FR**.
2. Las fechas y horas de la visita salen con convención `es-CA`, no `fr-CA`,
   a diferencia del resto de la aplicación.

No hay ningún parámetro `lang` en la llamada; el idioma no es configurable desde
la interfaz. Internacionalizar el correo exige (a) pasar el idioma desde el
frontend, (b) triplicar las plantillas y (c) cambiar el locale de las fechas.

---

## 3. Borrado de ofertas: quién manda es la RPC, no la política RLS

Hay dos mecanismos distintos y conviene no confundirlos.

### 3.1 La política `oferta_delete` no se usa desde la aplicación

```sql
-- política DELETE sobre public.oferta
NOT EXISTS (select 1 from expediente e
            where e.id = oferta.expediente_id
              and e.estado in ('adjudicado','contratado'))
AND (constructor_id = auth.uid() OR el llamante es administrador)
```

Prohíbe borrar una oferta cuando el expediente ya está `adjudicado` o
`contratado`. Pero el repositorio expone `OfertaRepository.deleteById()`
([`oferta.repository.ts:196`](../src/app/data/oferta.repository.ts#L196)) y
**ningún componente lo llama**: el método está muerto. La política solo protege
el acceso directo a la API REST, no la aplicación.

### 3.2 Lo que sí se ejecuta: `eliminar_oferta_admin` (SECURITY DEFINER)

Todo el borrado de la interfaz pasa por
`OfertaService.eliminarOferta()` → `eliminarConCascada()` → RPC
`eliminar_oferta_admin`, que es `SECURITY DEFINER` y por tanto **ignora la RLS
anterior**. Sus reglas propias son otras:

- exige rol `administrador` **o** `estimador` (el constructor no puede borrar su
  propia oferta desde aquí);
- si la oferta estaba `aceptada`, borra el contrato en estado `generado` y
  devuelve las demás ofertas a `pendiente`;
- recoloca el expediente en `estimado` (si no quedan ofertas) o en `en_oferta`.

En la interfaz el guardarraíl es `puedeEliminar` / `puedeEliminarOfertas`
([`admin/offer/edit/edit.component.ts:124-133`](../src/app/admin/offer/edit/edit.component.ts#L124-L133)),
que solo oculta el botón cuando el expediente está `contratado`. Con el
expediente `adjudicado` el borrado está permitido y funciona.

### 3.3 Hueco verificado: contrato cancelado + borrado de su oferta

`contrato.oferta_id` referencia `oferta(id)` **sin `ON DELETE`**
(`contrato_oferta_id_fkey`), así que la fila de contrato bloquea el borrado de
su oferta. `eliminar_oferta_admin` solo borra contratos en estado `generado`.

Secuencia reproducible, toda desde la interfaz de administrador:

1. El cliente acepta una oferta → contrato `generado`, expediente `adjudicado`.
2. El administrador **cancela el contrato** (`cancelar_contrato_admin`): el
   contrato queda `cancelado` (la fila **no** se borra), la oferta pasa a
   `rechazada` y el expediente vuelve a `en_oferta` o `estimado`.
3. El administrador intenta borrar esa oferta. La interfaz lo permite (el
   expediente no está `contratado`) y la RPC no encuentra la oferta en estado
   `aceptada`, así que no toca el contrato `cancelado`.
4. El `DELETE` falla con violación de clave foránea (SQLSTATE 23503).

El mensaje crudo de PostgreSQL se muestra tal cual en el formulario
(`errorEliminar.set(e.message)` en
[`edit.component.ts:447-449`](../src/app/admin/offer/edit/edit.component.ts#L447-L449)):
no está traducido ni explica la causa.

**Arreglo sugerido (una línea, no aplicado):** que `eliminar_oferta_admin` borre
los contratos en `('generado','cancelado')`, igual que ya hace `aceptar_oferta`
—que incluye `cancelado` justamente para evitar este choque al re-adjudicar.
