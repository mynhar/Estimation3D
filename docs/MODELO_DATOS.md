# Modelo de datos — base de datos de Estimation3D

> Esquema `public` de Supabase (PostgreSQL 17): **26 tablas, 1 vista, 53 claves
> foráneas y 10 enums**.
>
> **Extraído el 2026-11-03 de la base de producción**, no de
> `supabase/migrations/`: las migraciones del repositorio no contienen el
> esquema base. Incluye las columnas y valores del archivo de expedientes
> (`20261103b_estado_archivado`). Los tipos exactos y la nulabilidad de cada columna están en
> [`src/app/types/supabase.ts`](../src/app/types/supabase.ts); el ciclo de vida
> de los estados, en [`FLUJO_PROCESO.md`](./FLUJO_PROCESO.md).
>
> Las fuentes Mermaid están en [`diagramas/`](./diagramas/) (`bd-*.mmd`), junto
> con su versión en PNG y SVG.

## Cómo leer los diagramas

| Notación | Significado |
|---|---|
| `\|\|` | exactamente uno |
| `\|o` | cero o uno (la clave foránea admite `NULL`) |
| `o{` | cero o muchos |
| `o\|` en el lado hijo | cero o uno (la clave foránea es única: relación 1 a 1) |
| `PK` / `FK` / `UK` | clave primaria / foránea / única |
| `UK(a, b)` en un comentario | unicidad compuesta de esas columnas |
| "sin FK" | la columna guarda ids de otra tabla, pero sin clave foránea |

Las etiquetas de las relaciones son el nombre de la columna que hace de clave
foránea.

---

## Visión general

Todas las tablas y las relaciones de negocio. Para que se pueda leer, omite las
relaciones de autoría y auditoría con `perfil` (`creado_por`, `subido_por`,
`invitado_por`, `eliminada_por`, `sincronizado_por`, `actor_id`, `usuario_id`) y
las columnas redundantes (`seguimiento_obra.expediente_id`, `fase_actual_id`,
`reporte_diario.fase_id`, `perfil.especialidad_id`). Están todas en los
diagramas por dominio.

```mermaid
---
config:
  layout: elk
---
erDiagram
    perfil ||--o{ expediente : cliente_id
    perfil |o--o{ expediente : estimador_id
    servicio ||--o{ expediente : servicio_id
    expediente ||--o{ expediente_servicio : expediente_id
    servicio ||--o{ expediente_servicio : servicio_id
    expediente ||--o| localizacion : expediente_id
    expediente ||--o| estimacion : expediente_id
    perfil ||--o{ estimacion : estimador_id
    expediente ||--o{ expediente_invitacion : expediente_id
    perfil ||--o{ expediente_invitacion : constructor_id
    expediente ||--o{ matterport_modelo : expediente_id
    expediente ||--o{ oferta : expediente_id
    perfil ||--o{ oferta : constructor_id
    oferta ||--o| contrato : oferta_id
    expediente ||--o{ contrato : expediente_id
    perfil ||--o{ contrato : cliente_id
    perfil ||--o{ contrato : constructor_id
    contrato ||--o| seguimiento_obra : contrato_id
    perfil ||--o{ seguimiento_obra : constructor_id
    seguimiento_obra ||--o{ reporte_diario : seguimiento_id
    seguimiento_obra ||--o{ inspeccion : seguimiento_id
    servicio ||--o{ reporte_diario : servicio_id
    reporte_diario ||--o{ reporte_actividad : reporte_id
    reporte_diario ||--o{ reporte_zona : reporte_id
    actividad_servicio ||--o{ reporte_actividad : actividad_id
    servicio ||--o{ fase_servicio : servicio_id
    servicio ||--o{ actividad_servicio : servicio_id
    fase_servicio |o--o{ actividad_servicio : fase_id
    perfil ||--o{ perfil_especialidad : perfil_id
    servicio ||--o{ perfil_especialidad : servicio_id
    servicio |o--o{ imprevisto_catalogo : servicio_id
    ficha_normativa |o--o{ imprevisto_catalogo : ficha_codigo
    expediente ||--o{ asistente_conversacion : expediente_id
    expediente ||--o{ asistente_evento : expediente_id
    expediente |o--o{ archivo : expediente_id
    estimacion |o--o{ archivo : estimacion_id
    oferta |o--o{ archivo : oferta_id
    reporte_diario |o--o{ archivo : reporte_id
    oferta_auditoria
    landing_solicitud_intento
```

`perfil` es el centro del modelo: un mismo registro es cliente, estimador,
constructor o administrador según `perfil.rol`. Su `id` es el de
`auth.users` (1 a 1, con borrado en cascada).

---

## 1. Usuarios y expedientes

```mermaid
---
config:
  layout: elk
---
erDiagram
    perfil {
        uuid id PK "= auth.users.id"
        text nombre
        text apellido
        text email "copiado de auth.users"
        text telefono
        text avatar_url
        rol_usuario rol
        proveedor_auth proveedor
        bool activo
        bool perfil_completo
        text idioma "fr, en o es"
        text direccion_unidad
        text direccion_calle
        text direccion_ciudad
        text direccion_provincia
        text direccion_codigo_postal
        text compania_nombre "solo constructor"
        text compania_telefono "solo constructor"
        text compania_email "solo constructor"
        text compania_direccion "solo constructor"
        text rbq "licencia RBQ 0000-0000-00"
        int especialidad_id FK "resumen heredado"
        bool especialidad_todas
        smallint anios_experiencia "0 a 80"
        text zona_servicio
        text mensaje
        timestamptz creado_en
        timestamptz actualizado_en
    }
    perfil_especialidad {
        uuid perfil_id PK, FK
        int servicio_id PK, FK
        timestamptz creado_en
    }
    servicio {
        int id PK
        text codigo UK
        text nombre_fr
        text nombre_en
        text nombre_es
        text descripcion_fr
        text descripcion_en
        text descripcion_es
        bool activo
    }
    expediente {
        uuid id PK
        text numero UK "EXP-fecha-NNNN"
        uuid cliente_id FK
        uuid estimador_id FK
        uuid creado_por FK "inmutable"
        int servicio_id FK "servicio principal"
        estado_expediente estado
        estado_expediente estado_anterior "al archivar"
        timestamptz archivado_en
        text descripcion
        timestamptz fecha_visita
        timestamptz creado_en
        timestamptz actualizado_en
    }
    expediente_servicio {
        uuid expediente_id PK, FK
        int servicio_id PK, FK
        timestamptz creado_en
    }
    localizacion {
        uuid id PK
        uuid expediente_id FK, UK
        tipo_inmueble tipo_inmueble
        text direccion
        text provincia
        text canton "ciudad"
        text distrito "codigo postal"
        text referencia
        float8 latitud
        float8 longitud
    }
    estimacion {
        uuid id PK
        uuid expediente_id FK, UK
        uuid estimador_id FK
        text descripcion_problemas
        numeric costo_estimado "minimo del rango"
        numeric costo_estimado_max "maximo del rango"
        text url_tour "URL o lista JSON de URLs"
        text notas_internas
        timestamptz fecha_visita_real
        timestamptz creado_en
        timestamptz actualizado_en
    }
    expediente_invitacion {
        uuid id PK
        uuid expediente_id FK "UK(expediente_id, constructor_id)"
        uuid constructor_id FK
        uuid invitado_por FK
        timestamptz enviado_en
    }
    perfil ||--o{ expediente : cliente_id
    perfil |o--o{ expediente : estimador_id
    perfil |o--o{ expediente : creado_por
    servicio ||--o{ expediente : servicio_id
    servicio |o--o{ perfil : especialidad_id
    perfil ||--o{ perfil_especialidad : perfil_id
    servicio ||--o{ perfil_especialidad : servicio_id
    expediente ||--o{ expediente_servicio : expediente_id
    servicio ||--o{ expediente_servicio : servicio_id
    expediente ||--o| localizacion : expediente_id
    expediente ||--o| estimacion : expediente_id
    perfil ||--o{ estimacion : estimador_id
    expediente ||--o{ expediente_invitacion : expediente_id
    perfil ||--o{ expediente_invitacion : constructor_id
    perfil |o--o{ expediente_invitacion : invitado_por
```

| Tabla | Para qué sirve |
|---|---|
| `perfil` | Datos de cada usuario, su rol y si está activo. Los datos de compañía y profesionales (RBQ, especialidades, experiencia) solo se rellenan para constructores. |
| `perfil_especialidad` | Servicios que cubre cada constructor. `perfil.especialidad_todas` = cubre todos (excluyente con la lista). |
| `servicio` | Catálogo de servicios (moho, amianto, renovación…), con nombre en los tres idiomas. |
| `expediente` | La solicitud del cliente: un inmueble, un servicio principal, una visita y un estado. |
| `expediente_servicio` | Todos los servicios del expediente. Un trigger añade aquí siempre el servicio principal. |
| `localizacion` | Dirección del inmueble (una por expediente). |
| `estimacion` | El informe del estimador (una por expediente): problemas, rango de costo y tours 3D. |
| `expediente_invitacion` | Constructores invitados a ofertar. Si un expediente tiene invitaciones, solo esos constructores lo ven. |

---

## 2. Ofertas y contratos

```mermaid
---
config:
  layout: elk
---
erDiagram
    expediente {
        uuid id PK
        estado_expediente estado
    }
    perfil {
        uuid id PK
        rol_usuario rol
    }
    oferta {
        uuid id PK
        uuid expediente_id FK "UK(expediente_id, constructor_id) entre las vivas"
        uuid constructor_id FK
        numeric precio "mayor que 0"
        text descripcion
        int plazo_semanas_min
        int plazo_semanas_max
        int garantia_anos
        date fecha_inicio
        int[] servicio_ids "sin FK"
        estado_oferta estado
        estado_oferta estado_anterior "al archivar"
        timestamptz eliminada_en "borrado logico"
        uuid eliminada_por FK
        timestamptz creado_en
        timestamptz actualizado_en
    }
    oferta_auditoria {
        uuid id PK
        uuid oferta_id "sin FK"
        uuid expediente_id "sin FK"
        text accion "aceptada, rechazada, reactivada, eliminada, restaurada"
        uuid actor_id FK
        jsonb snapshot "fila de la oferta antes del cambio"
        timestamptz creado_en
    }
    contrato {
        uuid id PK
        uuid expediente_id FK
        uuid oferta_id FK, UK
        uuid cliente_id FK
        uuid constructor_id FK
        numeric precio_final
        int garantia_anos
        text descripcion_trabajo
        int[] servicio_ids "sin FK"
        estado_contrato estado
        estado_contrato estado_anterior "al archivar"
        text url_pdf
        timestamptz generado_en
        timestamptz firmado_en
        timestamptz actualizado_en
    }
    expediente ||--o{ oferta : expediente_id
    perfil ||--o{ oferta : constructor_id
    perfil |o--o{ oferta : eliminada_por
    oferta ||--o| contrato : oferta_id
    expediente ||--o{ contrato : expediente_id
    perfil ||--o{ contrato : cliente_id
    perfil ||--o{ contrato : constructor_id
    perfil |o--o{ oferta_auditoria : actor_id
```

| Tabla | Para qué sirve |
|---|---|
| `oferta` | Propuesta de un constructor para un expediente. Máximo 5 vivas por expediente y una por constructor. `servicio_ids` = servicios que cubre (un trigger exige que sean del expediente). |
| `oferta_auditoria` | Historial de cada cambio de estado o borrado de una oferta, con la fila completa en `snapshot`. No tiene FK a propósito, para que el historial sobreviva al borrado. |
| `contrato` | Uno por oferta aceptada. Copia el precio, la garantía y los servicios de la oferta al crearse. |

---

## 3. Seguimiento de obra

```mermaid
---
config:
  layout: elk
---
erDiagram
    contrato {
        uuid id PK
        estado_contrato estado
        int[] servicio_ids
    }
    expediente {
        uuid id PK
    }
    perfil {
        uuid id PK
    }
    servicio {
        int id PK
        text codigo UK
    }
    seguimiento_obra {
        uuid id PK
        uuid contrato_id FK, UK
        uuid expediente_id FK
        uuid constructor_id FK
        estado_seguimiento estado
        estado_seguimiento estado_anterior "al archivar"
        numeric porcentaje_avance "media del avance por servicio"
        uuid fase_actual_id FK
        timestamptz fecha_inicio_real
        timestamptz fecha_fin_real
        timestamptz creado_en
        timestamptz actualizado_en
    }
    reporte_diario {
        uuid id PK
        uuid seguimiento_id FK "UK(seguimiento_id, fecha, servicio_id)"
        uuid constructor_id FK
        int servicio_id FK "del contrato"
        uuid fase_id FK "del mismo servicio"
        date fecha
        time hora_inicio
        time hora_fin
        numeric horas_trabajadas "0 a 24"
        numeric porcentaje_avance_dia "0 a 100"
        numeric porcentaje_acumulado "lo calcula la base"
        text descripcion
        timestamptz creado_en
        timestamptz actualizado_en
    }
    reporte_actividad {
        uuid id PK
        uuid reporte_id FK "UK(reporte_id, actividad_id)"
        uuid actividad_id FK
        timestamptz creado_en
    }
    reporte_zona {
        uuid id PK
        uuid reporte_id FK
        text zona
        text descripcion
        numeric porcentaje_avance
        timestamptz creado_en
    }
    inspeccion {
        uuid id PK
        uuid seguimiento_id FK
        tipo_visitante tipo_visitante
        date fecha
        time hora
        text motivo
        estado_inspeccion estado
        uuid creado_por FK
        timestamptz creado_en
        timestamptz actualizado_en
    }
    fase_servicio {
        uuid id PK
        int servicio_id FK "UK(servicio_id, orden) y UK(servicio_id, codigo)"
        text codigo
        int orden
        text nombre_fr
        text nombre_en
        text nombre_es
        text descripcion_fr
        text descripcion_en
        text descripcion_es
        bool activo
        timestamptz creado_en
    }
    actividad_servicio {
        uuid id PK
        int servicio_id FK "UK(servicio_id, codigo)"
        uuid fase_id FK
        text codigo
        text nombre_fr
        text nombre_en
        text nombre_es
        bool activo
        timestamptz creado_en
    }
    contrato ||--o| seguimiento_obra : contrato_id
    expediente ||--o{ seguimiento_obra : expediente_id
    perfil ||--o{ seguimiento_obra : constructor_id
    fase_servicio |o--o{ seguimiento_obra : fase_actual_id
    seguimiento_obra ||--o{ reporte_diario : seguimiento_id
    perfil ||--o{ reporte_diario : constructor_id
    servicio ||--o{ reporte_diario : servicio_id
    fase_servicio |o--o{ reporte_diario : fase_id
    reporte_diario ||--o{ reporte_actividad : reporte_id
    actividad_servicio ||--o{ reporte_actividad : actividad_id
    reporte_diario ||--o{ reporte_zona : reporte_id
    seguimiento_obra ||--o{ inspeccion : seguimiento_id
    perfil ||--o{ inspeccion : creado_por
    servicio ||--o{ fase_servicio : servicio_id
    servicio ||--o{ actividad_servicio : servicio_id
    fase_servicio |o--o{ actividad_servicio : fase_id
```

| Tabla | Para qué sirve |
|---|---|
| `seguimiento_obra` | La obra de un contrato (uno por contrato, se crea al firmarlo). Guarda el estado y el avance global. |
| `reporte_diario` | El parte diario del constructor: un servicio, una fase y el % de avance del día. Como máximo uno por día y servicio. |
| `reporte_actividad` | Actividades del catálogo marcadas como hechas en el parte. |
| `reporte_zona` | Avance por zona del inmueble dentro del parte. |
| `inspeccion` | Visitas programadas a la obra (inspector, dueño o estimador). |
| `fase_servicio` | Fases ordenadas de cada servicio (catálogo). |
| `actividad_servicio` | Actividades de cada servicio, opcionalmente agrupadas por fase (catálogo). |

---

## 4. Archivos y Matterport

```mermaid
---
config:
  layout: elk
---
erDiagram
    perfil {
        uuid id PK
    }
    expediente {
        uuid id PK
    }
    estimacion {
        uuid id PK
    }
    oferta {
        uuid id PK
    }
    reporte_diario {
        uuid id PK
    }
    archivo {
        uuid id PK
        tipo_archivo tipo
        text nombre_archivo
        text url_storage "ruta en Storage"
        text mime_type
        bigint tamano_bytes
        uuid subido_por FK
        uuid expediente_id FK
        uuid estimacion_id FK
        uuid oferta_id FK
        uuid reporte_id FK
        timestamptz creado_en
    }
    matterport_modelo {
        uuid id PK
        uuid expediente_id FK "UK(expediente_id, model_id)"
        text model_id
        text url_tour
        text nombre
        text descripcion
        text estado
        text visibilidad
        bool publicado
        text resumen_publico
        text imagen_url
        text share_url
        text direccion
        text calle
        text ciudad
        text region
        text codigo_postal
        text pais
        numeric latitud
        numeric longitud
        numeric area_piso_m2
        numeric area_piso_interior_m2
        numeric area_pared_m2
        numeric area_techo_m2
        numeric area_piso_ft2
        numeric area_piso_interior_ft2
        numeric volumen_m3
        numeric alto_m
        numeric ancho_m
        numeric profundidad_m
        int total_pisos
        int total_habitaciones
        jsonb pisos
        jsonb habitaciones
        jsonb datos_crudos "respuesta completa de la API"
        timestamptz creado_matterport
        timestamptz modificado_matterport
        timestamptz sincronizado_en
        uuid sincronizado_por FK
        timestamptz creado_en
    }
    perfil ||--o{ archivo : subido_por
    expediente |o--o{ archivo : expediente_id
    estimacion |o--o{ archivo : estimacion_id
    oferta |o--o{ archivo : oferta_id
    reporte_diario |o--o{ archivo : reporte_id
    expediente ||--o{ matterport_modelo : expediente_id
    perfil |o--o{ matterport_modelo : sincronizado_por
```

| Tabla | Para qué sirve |
|---|---|
| `archivo` | Metadatos de cada fichero subido a Storage (fotos, vídeos, documentos, PDF de contrato, adjuntos de reportes). Cuelga de un expediente, una estimación, una oferta o un reporte. |
| `matterport_modelo` | Copia de los datos de un modelo 3D de Matterport (medidas, pisos, habitaciones), sincronizada por la Edge Function `matterport-sync`. |

---

## 5. Catálogos de referencia, asistente IA y landing

```mermaid
---
config:
  layout: elk
---
erDiagram
    servicio {
        int id PK
        text codigo UK
    }
    expediente {
        uuid id PK
    }
    perfil {
        uuid id PK
    }
    ficha_normativa {
        int id PK
        text codigo UK
        text titulo_fr
        text titulo_en
        text titulo_es
        text resumen_fr
        text resumen_en
        text resumen_es
        text[] palabras_clave
        bool activo
        int orden
        timestamptz creado_en
    }
    imprevisto_catalogo {
        int id PK
        int servicio_id FK "NULL = cualquier servicio"
        text codigo UK
        text titulo_fr
        text titulo_en
        text titulo_es
        text perfil_fr
        text perfil_en
        text perfil_es
        text protocolo_fr
        text protocolo_en
        text protocolo_es
        bool requiere_aprobacion
        text ficha_codigo FK
        bool activo
        int orden
        timestamptz creado_en
    }
    asistente_conversacion {
        uuid id PK
        uuid expediente_id FK
        uuid usuario_id FK
        text role "user o assistant"
        text content
        timestamptz creado_en
    }
    asistente_evento {
        uuid id PK
        uuid expediente_id FK
        uuid usuario_id FK
        rol_usuario rol
        text tipo "salud, escalada, caso externo, imprevisto..."
        text resumen
        jsonb payload
        bool resuelto
        timestamptz creado_en
    }
    landing_solicitud_intento {
        bigint id PK
        text email
        text ip
        timestamptz creado_en
    }
    servicio |o--o{ imprevisto_catalogo : servicio_id
    ficha_normativa |o--o{ imprevisto_catalogo : ficha_codigo
    expediente ||--o{ asistente_conversacion : expediente_id
    perfil ||--o{ asistente_conversacion : usuario_id
    expediente ||--o{ asistente_evento : expediente_id
    perfil ||--o{ asistente_evento : usuario_id
```

| Tabla | Para qué sirve |
|---|---|
| `ficha_normativa` | Fichas de normativa de Quebec que el asistente IA usa como fuente de referencia. |
| `imprevisto_catalogo` | Imprevistos conocidos por servicio, con su protocolo y la ficha normativa asociada. También es fuente de referencia del asistente. |
| `asistente_conversacion` | Historial del chat con el asistente IA, por usuario y expediente. |
| `asistente_evento` | Eventos internos que registra el asistente (salud mencionada, escalada humana, caso externo, imprevistos). El usuario no los ve; el administrador los revisa en `admin/ai-events`. |
| `landing_solicitud_intento` | Registro de los envíos de los formularios públicos, para el límite por correo e IP. Se purga a los 7 días y solo la escribe el service role. |

---

## Enums

| Enum | Valores |
|---|---|
| `rol_usuario` | `cliente`, `estimador`, `constructor`, `administrador` |
| `proveedor_auth` | `email`, `google` |
| `estado_expediente` | `nuevo`, `en_estimacion`, `estimado`, `en_oferta`, `adjudicado`, `contratado`, `cancelado`, `archivado` |
| `estado_oferta` | `pendiente`, `aceptada`, `rechazada`, `archivado` |
| `estado_contrato` | `generado`, `firmado`, `en_ejecucion`, `completado`, `cancelado`, `archivado` |
| `estado_seguimiento` | `no_iniciado`, `en_progreso`, `pausado`, `completado` |
| `estado_inspeccion` | `programada`, `realizada`, `cancelada` |
| `tipo_visitante` | `inspector`, `dueno`, `estimador` |
| `tipo_archivo` | `foto`, `video`, `documento`, `contrato_pdf`, `reporte_foto`, `reporte_video`, `reporte_documento` |
| `tipo_inmueble` | `casa`, `apartamento`, `edificio`, `local_comercial`, `otro` |

## Vista

`expediente_busqueda` une `expediente` con su `localizacion` para buscar por
dirección. Usa `security_invoker`, así que respeta las políticas RLS de quien
consulta.

---

## Reglas que no se ven en el diagrama

- **Arrays de servicios sin FK.** `oferta.servicio_ids` y
  `contrato.servicio_ids` guardan ids de `servicio` sin clave foránea. Los
  protegen triggers: `fn_oferta_servicios` exige que sean servicios del
  expediente (y, si no se indican, pone todos) y `fn_contrato_servicios` los
  copia de la oferta al crear el contrato.
- **Servicio principal duplicado a propósito.** `expediente.servicio_id` es el
  principal y `expediente_servicio` la lista completa; un trigger
  (`fn_expediente_servicio_principal`) mete siempre el principal en la lista.
- **Coherencia del reporte diario.** `fn_reporte_servicio` exige que el
  servicio del reporte sea uno del contrato y que la fase pertenezca a ese
  servicio.
- **`perfil.especialidad_id` es un resumen heredado.** La lista real está en
  `perfil_especialidad`; esa columna guarda el único servicio elegido, o `NULL`
  si hay varios, para lecturas antiguas.
- **Archivo del expediente.** `archivar_expediente_admin` pasa el expediente,
  sus ofertas no eliminadas y todos sus contratos a `archivado`, y sus
  seguimientos a `pausado`; en cada fila guarda el estado previo en
  `estado_anterior` (y la fecha en `expediente.archivado_en`).
  `desarchivar_expediente_admin` (migración `20261103e`) lo deshace: cada fila
  vuelve a su `estado_anterior`, que queda a NULL, y `archivado_en` se borra.
  Lo protegen triggers de guardia:
  `fn_guardia_archivado` (nadie entra en `archivado` ni sale de él fuera de esas
  dos RPC, que se identifican con el ajuste local `app.archivo = 'on'`),
  `fn_guardia_expediente_archivado` (no se crean ofertas ni contratos en un
  expediente archivado), `fn_guardia_reporte_archivado` (no se crean ni
  modifican partes de un contrato archivado; borrarlos sí) y
  `fn_guardia_seguimiento_archivado` (no cambia el estado ni el avance de su
  obra). Además, `fn_guardia_archivado_solo_admin` (trigger
  `trg_archivado_solo_admin` en las 14 tablas del expediente; migración
  `20261103d`) impide a cualquier usuario que no sea
  administrador crear, modificar o borrar filas de un expediente archivado;
  `fn_expediente_de_fila` averigua a qué expediente pertenece cada fila. El
  ciclo completo está en [`FLUJO_PROCESO.md`](./FLUJO_PROCESO.md) § 6.
- **Nombres de dirección heredados.** En `localizacion`, `canton` guarda la
  ciudad y `distrito` el código postal.
- **Qué pasa al borrar:**
  - Borrar un expediente arrastra en cascada su localización, estimación,
    ofertas, archivos, invitaciones, conversaciones y seguimientos, **pero no
    se puede si tiene contratos** (`contrato.expediente_id` es `NO ACTION`).
    Lo mismo pasa con una oferta que tenga contrato.
  - El `perfil` se borra en cascada con su usuario de `auth.users`, pero
    casi todas las FK hacia `perfil` son `NO ACTION`: un usuario con
    expedientes, ofertas o contratos no se puede borrar sin limpiar antes.
    Para eso existen los scripts de
    [`scripts/borrado-usuario/`](../scripts/borrado-usuario/).
