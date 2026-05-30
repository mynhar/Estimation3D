# CLAUDE.md

Este archivo se carga automáticamente al abrir el proyecto en Claude Code. Define las reglas que Claude debe seguir en cada sesión de trabajo.

---

## Regla principal

Para construir, auditar o rediseñar UI, usa la skill **`hallmark`**. Hallmark aplica su disciplina de diseño (slop-test gates, variedad estructural, reglas anti-AI-slop) **sobre** el sistema de este proyecto, que está **bloqueado**.

Fuentes de verdad, en orden:

1. **[`./DESIGN_GUIDELINES.md`](./DESIGN_GUIDELINES.md)** — guía detallada: tokens, paleta, utilidades, patrones, convenciones. Léela antes de cualquier trabajo de UI.
2. **[`./design.md`](./design.md)** — archivo de bloqueo que Hallmark lee primero. Defiere a él: **no** elegir temas, paletas ni tipografías nuevas.
3. `src/styles/tokens.css` — los tokens reales viven aquí con nombres `var(--ds-...)`. Úsalos; nunca inventes nombres `--color-*`.

---

## Stack del proyecto

- **Framework**: Angular 18 (standalone components, signals, nuevo control flow)
- **Estilos**: Bootstrap 5.3 + CSS plano (NO SCSS, NO Tailwind)
- **Sistema de diseño**: tokens CSS en `src/styles/tokens.css`
- **Tipografías**: Fraunces (títulos) + DM Sans (cuerpo)
- **Iconos**: line/stroke (Lucide / Phosphor recomendados)
- **Skill de diseño**: `hallmark` (bloqueada a `design.md` + `DESIGN_GUIDELINES.md`)

---

## Skill de diseño: Hallmark

- Por defecto: pedir construir/diseñar algo → Hallmark sigue su flujo ciñéndose a `design.md` y `DESIGN_GUIDELINES.md`.
- `hallmark audit <archivo>` → revisa UI existente contra anti-patrones, sin editar.
- `hallmark redesign <archivo>` → rediseña dentro de los límites del proyecto, conservando rutas, copy e identidad.
- **Importante**: Hallmark genera HTML/CSS por defecto. En este proyecto SIEMPRE debe entregar **componentes Angular 18 standalone**, no markup suelto ni JSX.
- No emitir un nuevo `design.md`: ya existe y el sistema está bloqueado.

---

## Antes de generar código

1. Lee `DESIGN_GUIDELINES.md` y `design.md` si vas a tocar UI.
2. Usa la skill `hallmark` para el trabajo de interfaz.
3. Identifica qué tokens CSS (`var(--ds-...)`) y qué utilidades del sistema vas a usar.
4. Si la tarea es ambigua, pregunta antes de asumir una dirección estética.

---

## Reglas obligatorias (resumen)

### Angular 18
- Standalone components, siempre
- `ChangeDetectionStrategy.OnPush`, siempre
- Signals (`input()`, `output()`, `signal()`, `computed()`), no decoradores antiguos
- Nuevo control flow (`@if`, `@for`, `@switch`, `@defer`), nunca `*ngIf` / `*ngFor`
- `track` obligatorio en `@for`

### Estilos
- Usa tokens CSS del sistema (`var(--ds-...)`), nunca hex sueltos
- CSS plano por componente (no SCSS), selector raíz `:host`
- Bootstrap personalizado: usa sus clases (`.btn`, `.card`, `.row`, etc.) sin sobrescribirlas innecesariamente

### Identidad visual
- Fondo beige `#F5F3EE`, alterno `#EFEDE6`, tarjetas crema `#FBFAF6`, tinta `#1A1A1A`, acento dorado `#D4B96E`
- Tipografía: Fraunces para títulos, DM Sans para cuerpo
- Iconos line/stroke, nunca filled
- Bordes redondeados sutiles (4–12 px máximo)
- Espaciado generoso

### Prohibiciones
- Fondos negros / `#000`
- Bootstrap defaults sin override (`#0d6efd`, `#6c757d`)
- Gradientes morado-rosa
- Fuentes Inter, Roboto, Arial como principales
- Iconos filled / emojis decorativos en UI
- Sombras con `rgba(0,0,0,..)` (usar `rgba(26,26,26,..)` o tokens)
- `border-radius` > 12px en UI
- NgModules nuevos
- `*ngIf` / `*ngFor` / `*ngSwitch` en código nuevo
- Decoradores `@Input()` / `@Output()` en código nuevo
- UI genérica sin postura estética
- Que Hallmark elija un tema/paleta nuevos (sistema bloqueado en `design.md`)

---

## Estructura del proyecto

```
src/
├── index.html                  ← fuentes de Google aquí
├── styles.css                  ← overrides puntuales (mantener mínimo)
├── styles/
│   ├── tokens.css              ← sistema de tokens
│   ├── bootstrap-overrides.css
│   └── components.css          ← utilidades propias del sistema
└── app/
    ├── core/                   ← servicios singleton, interceptors, guards
    ├── shared/                 ← componentes reutilizables
    │   ├── ui/
    │   └── layout/
    ├── features/               ← funcionalidad por dominio
    └── app.config.ts
```

---

## Comandos útiles

```bash
ng serve                                              # dev server
ng build                                              # build producción
ng test                                               # tests
ng generate component shared/ui/nombre \
  --standalone --change-detection OnPush --style css  # nuevo componente con reglas del proyecto
```

---

## Checklist antes de cerrar un componente

- [ ] Standalone + `OnPush`
- [ ] `input()` / `signal()` (no `@Input()`)
- [ ] `@if` / `@for` con `track` (no `*ngIf` / `*ngFor`)
- [ ] Tokens CSS `var(--ds-...)` (no hex sueltos)
- [ ] HTML semántico
- [ ] Estados: hover, focus, active, disabled, loading
- [ ] Contraste WCAG AA (4.5:1)
- [ ] Iconos line/stroke
- [ ] Sin fondos negros, sin emojis decorativos
- [ ] Conforme a `design.md` y `DESIGN_GUIDELINES.md` (sistema bloqueado)
- [ ] Dirección estética intencional, no genérica
