# Borrado de un expediente y sus datos relacionados

Proyecto Supabase: **Estimation3D** (`ckdksfvxjimxuqceoeyr`)

Herramienta **reutilizable**: para purgar cualquier expediente solo cambias el
**número** en un único sitio (argumento del `.mjs` y línea `set_config` del SQL).

> ⚠️ **Operación IRREVERSIBLE.** Haz un backup / punto de restauración antes.
> El `.mjs` viene en modo *simulación* por defecto; el SQL trae previsualización.

## Qué borra

1. **Registros del expediente** (SQL): el expediente y, por cascada, su
   localización, estimaciones, ofertas, contrato, seguimiento de obra, reportes
   (diario / actividad / zona), inspecciones y las filas de `archivo`.
2. **Ficheros físicos** (Storage API): todo lo que cuelga de
   `expedientes/<id>/…` en el bucket `archivos`, más los ficheros referenciados
   por `archivo` a través de las estimaciones / ofertas / reportes del
   expediente (prefijos `ofertas/`, `reportes/`, …).

## Orden de ejecución (IMPORTANTE)

Primero el storage (necesita la BD intacta), luego la BD:

```bash
# 1) Ficheros físicos — SIMULACIÓN (no borra):
node scripts/borrado-expediente/01-borrar-storage.mjs EXP-20260518-1543

#    Borrado real (DRY_RUN=false en el .env, o como variable):
DRY_RUN=false node scripts/borrado-expediente/01-borrar-storage.mjs EXP-20260518-1543

# 2) Registros en la base de datos:
#    Abre 02-borrar-expediente.sql en el SQL Editor de Supabase.
#    Edita la línea set_config con el número; ejecuta [set_config + SECCIÓN 0]
#    para previsualizar y luego [set_config + SECCIÓN 1] → COMMIT.
```

En PowerShell, `DRY_RUN` se pone aparte:
```powershell
$env:DRY_RUN="false"; node scripts/borrado-expediente/01-borrar-storage.mjs EXP-20260518-1543
```

## Credenciales

El `.mjs` necesita `SUPABASE_SERVICE_ROLE_KEY`. Reutiliza automáticamente el
`.env` de `scripts/borrado-usuario/` si existe; si no, crea uno en esta carpeta
con `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y `DRY_RUN`. Nunca subas el
`.env` al repo (ya está en `.gitignore`).

## Nota de orden de borrado

Las FK `contrato→expediente` y `contrato→oferta` son `NO ACTION`, por eso el SQL
borra el **contrato antes** que el expediente; el resto cae por cascada.
