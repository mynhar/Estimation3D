# Flujo del proceso — de la creación del expediente a la obra completada

> Diagramas derivados del código real: estados de los enums (`estado_expediente`,
> `estado_oferta`, `estado_contrato`, `estado_seguimiento`) y las RPCs/servicios
> que los transicionan. Fuentes: `src/app/data/*`, `src/app/services/*`,
> `supabase/migrations/*`.

## Actores

| Rol | Responsabilidad principal |
|-----|---------------------------|
| **Cliente** | Crea el expediente, recibe ofertas, acepta una y firma el contrato. |
| **Estimador** | Toma expedientes nuevos, los estima (costo + tour 3D). |
| **Constructor** | Ve expedientes estimados y envía ofertas; ejecuta y reporta la obra. |
| **Administrador** | Supervisa todo; puede adjudicar, iniciar ejecución y completar contratos. |

---

## 1. Flujo extremo a extremo

```mermaid
flowchart TD
    subgraph CLIENTE
        A1["Crea expediente<br/>(servicio, visita, fotos, ubicación)"]
        A2["Revisa ofertas recibidas"]
        A3["Acepta una oferta"]
        A4["Firma el contrato"]
    end

    subgraph ESTIMADOR
        B1["Toma expediente nuevo<br/>(se asigna estimador)"]
        B2["Realiza estimación<br/>(rango de costo + URL tour 3D)"]
    end

    subgraph CONSTRUCTOR
        C1["Ve expedientes disponibles<br/>(estimado / en_oferta)"]
        C2["Envía oferta<br/>(precio, plazo)"]
        C3["Ejecuta la obra y<br/>sube reportes / % avance"]
    end

    subgraph ADMINISTRADOR
        D1["Inicia ejecución del contrato"]
        D2["Marca contrato completado"]
    end

    A1 -->|expediente: nuevo| B1
    B1 -->|expediente: en_estimacion| B2
    B2 -->|expediente: estimado| C1
    C1 --> C2
    C2 -->|1ª oferta → expediente: en_oferta<br/>oferta: pendiente| A2
    A2 --> A3
    A3 -->|RPC aceptar_oferta_contrato| ADJ
    ADJ["expediente: adjudicado<br/>oferta elegida: aceptada · resto: rechazada<br/>+ contrato: generado"] --> A4
    A4 -->|RPC firmar_contrato| FIRM
    FIRM["contrato: firmado<br/>expediente: contratado"] --> D1
    D1 -->|RPC iniciar_ejecucion| EJEC
    EJEC["contrato: en_ejecucion<br/>seguimiento: en_progreso"] --> C3
    C3 --> D2
    D2 -->|RPC completar_contrato| FIN
    FIN["contrato: completado<br/>seguimiento: completado (100%)"]

    classDef estado fill:#FBFAF6,stroke:#D4B96E,color:#1A1A1A;
    class ADJ,FIRM,EJEC,FIN estado;
```

---

## 2. Ciclo de vida del **expediente**

```mermaid
stateDiagram-v2
    [*] --> nuevo: Cliente crea expediente
    nuevo --> en_estimacion: Estimador lo toma (asignarEstimador)
    en_estimacion --> nuevo: Estimador libera (liberar)
    en_estimacion --> estimado: Estimador publica estimación
    estimado --> en_oferta: 1ª oferta del constructor
    en_oferta --> adjudicado: Cliente/Admin acepta oferta
    adjudicado --> contratado: Cliente firma contrato
    contratado --> [*]: Obra en marcha

    nuevo --> cancelado
    en_estimacion --> cancelado
    estimado --> cancelado
    en_oferta --> cancelado
    cancelado --> [*]
```

---

## 3. Ciclo de vida del **contrato** (y seguimiento de obra)

```mermaid
stateDiagram-v2
    [*] --> generado: aceptar_oferta_contrato
    generado --> firmado: firmar_contrato (Cliente)
    firmado --> en_ejecucion: iniciar_ejecucion (Admin)
    en_ejecucion --> completado: completar_contrato (Admin)
    completado --> [*]

    generado --> cancelado: cancelar_contrato_admin
    firmado --> cancelado
    en_ejecucion --> cancelado
    cancelado --> [*]

    note right of en_ejecucion
        seguimiento_obra:
        no_iniciado → en_progreso
        (↔ pausado) → completado
        constructor sube reportes y % avance
    end note
```

---

## Resumen de transiciones (estado ↔ disparador)

| # | Acción (actor) | Mecanismo | Expediente | Oferta | Contrato | Seguimiento |
|---|----------------|-----------|------------|--------|----------|-------------|
| 1 | Crear expediente (Cliente) | `expediente.insert` | → `nuevo` | — | — | — |
| 2 | Tomar para estimar (Estimador) | `asignarEstimador` | → `en_estimacion` | — | — | — |
| 3 | Publicar estimación (Estimador) | `updateEstado` | → `estimado` | — | — | — |
| 4 | Enviar oferta (Constructor) | `oferta.insert` + `updateEstadoExpedienteEnOferta` | → `en_oferta` | `pendiente` | — | — |
| 5 | Aceptar oferta (Cliente/Admin) | RPC `aceptar_oferta_contrato` | → `adjudicado` | elegida `aceptada`, resto `rechazada` | crea `generado` | — |
| 6 | Firmar contrato (Cliente) | RPC `firmar_contrato` | → `contratado` | — | → `firmado` | — |
| 7 | Iniciar ejecución (Admin) | RPC `iniciar_ejecucion_contrato` | — | — | → `en_ejecucion` | → `en_progreso` |
| 8 | Reportar avance (Constructor) | `seguimiento` updates | — | — | — | `en_progreso`/`pausado` |
| 9 | Completar (Admin) | RPC `completar_contrato` | — | — | → `completado` | → `completado` (100%) |
| — | Cancelar | RPC / update | `cancelado` | — | `cancelado` | — |
