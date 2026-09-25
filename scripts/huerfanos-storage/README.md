# Huérfanos de Storage bajo `ofertas/`

Ficheros en el bucket `archivos` cuya ruta es `ofertas/<oferta_id>/…` pero cuyo
`<oferta_id>` ya no existe en la tabla `oferta`.

## De dónde salieron

Hasta la migración `20260924_oferta_borrado_logico_y_auditoria.sql`:

1. `eliminar_oferta_admin` hacía `DELETE` físico de la oferta.
2. `archivo` cae en cascada, así que las filas de fichero desaparecían con ella.
3. `ArchivoRepository.removeFromStorage()` no comprobaba el `error` que devuelve
   `storage.remove()`, así que un borrado denegado o fallido pasaba en silencio.

Resultado: la fila se iba, el fichero se quedaba, y nadie se enteraba.

Las dos causas están corregidas —las ofertas ahora se dan de baja lógicamente y
`removeFromStorage` lanza—, así que esto no vuelve a acumularse. El script existe
para el pasivo anterior.

## Antes de borrar nada

**Estos ficheros son la única prueba que queda de las ofertas borradas antes de
la migración.** En el caso que motivó todo esto (EXP-20260626-8185, 3812 rue
Masson), el PDF huérfano es lo único que permite reconstruir la oferta perdida.

Ejecuta primero el inventario, descarga lo que tenga valor, y sólo después borra.

## Uso

Necesita `SUPABASE_SERVICE_ROLE_KEY`. Reutiliza el `.env` de
`scripts/borrado-usuario/` o crea uno aquí (ver el `.env.example` de esa carpeta).

```bash
# Inventario, con URL de descarga firmada (7 días). No borra nada.
node scripts/huerfanos-storage/01-listar-huerfanos.mjs

# Borrado real: dos cerrojos, la bandera y la variable.
DRY_RUN=false node scripts/huerfanos-storage/01-listar-huerfanos.mjs --borrar
```
