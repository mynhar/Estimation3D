# Borrado de un usuario y sus datos relacionados

Proyecto Supabase: **Estimation3D** (`ckdksfvxjimxuqceoeyr`)

Herramienta **reutilizable**: para purgar a cualquier usuario solo cambias el
**email** en un único sitio (argumento del `.mjs` y línea `set_config` del SQL).

> ⚠️ **Operación IRREVERSIBLE.** Haz un backup / punto de restauración antes.
> Los scripts vienen en modo *simulación* / *previsualización*: no borran nada
> hasta que lo confirmas explícitamente.

## Qué borra

1. **Registros relacionados con el usuario** (SQL): sus expedientes y, por cascada,
   localización, estimaciones, ofertas, contrato, seguimiento de obra, reportes
   (diario / actividad / zona), inspecciones y las filas de `archivo`. Además los
   archivos que subió y las inspecciones que creó.
2. **Ficheros físicos del usuario** (Storage API): todo lo que cuelga de
   `expedientes/<id-de-sus-expedientes>/…` en el bucket `archivos`.
3. **Archivos sin contexto** (huérfanos):
   - En la tabla `archivo`: filas con todas las FK en NULL (SQL).
   - En Storage: objetos del bucket `archivos` sin fila en `archivo`
     (**excluye `avatares/`**, que se gestionan aparte).

## Orden de ejecución (IMPORTANTE)

Primero el storage (necesita la BD intacta para saber qué borrar), luego la BD:

Sustituye `correo@ejemplo.com` por el email a purgar:

```bash
# 1) Ficheros físicos — SIMULACIÓN (no borra):
node scripts/borrado-usuario/01-borrar-storage.mjs correo@ejemplo.com

#    Ejecutar de verdad:
DRY_RUN=false node scripts/borrado-usuario/01-borrar-storage.mjs correo@ejemplo.com

# 2) Registros en la base de datos:
#    Abre 02-borrar-usuario.sql en el SQL Editor de Supabase.
#    Edita la línea set_config (arriba del todo) con el email objetivo.
#    Ejecuta [set_config + SECCIÓN 0] para previsualizar; revisa las cifras y
#    luego ejecuta [set_config + SECCIÓN 1] y confirma con COMMIT.
```

### Variables de entorno para el paso 1

```bash
export SUPABASE_URL="https://ckdksfvxjimxuqceoeyr.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service_role key — NUNCA lo subas al repo>"
# El email va como argumento del comando; también puedes usar TARGET_EMAIL.
```

El `service_role` key está en Supabase → Project Settings → API. Trátalo como
un secreto: no lo escribas en el código ni lo commitees.

## Nota sobre el rol del usuario

La purga borra los datos de los que el usuario es **dueño**: sus expedientes
(como cliente) y todo lo que cuelga de ellos, los archivos que subió y las
inspecciones que creó. Está pensada para usuarios **cliente**.

Si el usuario es **estimador/constructor**, sus asignaciones sobre expedientes de
*otros* clientes (`estimador_id`, `constructor_id`, …) **no** se borran a
propósito (son datos de terceros). La SECCIÓN 0 del SQL muestra esas asignaciones
para que lo revises; en ese caso, borrar la cuenta fallará por las FK `NO ACTION`.

## Borrar también la cuenta (login)

Se controla con un interruptor al inicio de `02-borrar-usuario.sql`:

```sql
SELECT set_config('app.borrar_cuenta', 'true',  false); -- borra datos + cuenta
SELECT set_config('app.borrar_cuenta', 'false', false); -- borra solo los datos
```

Con `'true'` se elimina también `perfil` y el usuario de `auth` (login). El
borrado de la cuenta falla a propósito si el usuario todavía tiene asignaciones
en datos de otros clientes (estimador/constructor) por las FK `NO ACTION`.
