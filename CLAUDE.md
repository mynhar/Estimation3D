# CLAUDE.md

Este archivo se carga automáticamente al abrir el proyecto en Claude Code. Define las reglas que Claude debe seguir en cada sesión de trabajo.

---

## Regla principal

Antes de cualquier trabajo de UI, lee y respeta estrictamente **[`./DESIGN_GUIDELINES.md`](./DESIGN_GUIDELINES.md)**. Ese archivo es la fuente de verdad para diseño, tokens, componentes y convenciones del proyecto.

---

## Stack del proyecto

- **Framework**: Angular 18 (standalone components, signals, nuevo control flow)
- **Estilos**: Bootstrap 5.3 + CSS plano
- **Sistema de diseño**: tokens CSS en `src/styles/tokens.css`
- **Tipografías**: Fraunces (títulos) + DM Sans (cuerpo)
- **Iconos**: line/stroke (Lucide recomendado)

---

## Antes de generar código

1. Lee `DESIGN_GUIDELINES.md` si vas a tocar UI.
2. Identifica qué tokens CSS (`var(--ds-...)`) y qué utilidades del sistema vas a usar.
3. Si la tarea es ambigua, pregunta antes de asumir una dirección estética.

---

## Reglas obligatorias (resumen)

### Angular 18
- Standalone components, siempre
- `ChangeDetectionStrategy.OnPush`, siempre
- Signals (`input()`, `output()`, `signal()`, `computed()`), no decoradores antiguos
- Nuevo control flow (`@if`, `@for`, `@switch`, `@defer`), nunca `*ngIf` / `*ngFor`
- `track` obligatorio en `@for`

### Estilos
- Usa tokens CSS del sistema, nunca hex sueltos
- CSS plano por componente (no SCSS)
- Bootstrap personalizado: usa sus clases (`.btn`, `.card`, `.row`, etc.) sin sobrescribirlas innecesariamente

### Identidad visual
- Fondo beige `#F5F3EE`, tarjetas crema `#FBFAF6`, tinta `#1A1A1A`, acento dorado `#D4B96E`
- Tipografía: Fraunces para títulos, DM Sans para cuerpo
- Iconos line/stroke, nunca filled
- Bordes redondeados sutiles (4–12 px máximo)
- Espaciado generoso

### Prohibiciones
- Fondos negros
- Gradientes morado-rosa
- Fuentes Inter, Roboto, Arial como principales
- Emojis decorativos en UI
- NgModules nuevos
- `*ngIf` / `*ngFor` / `*ngSwitch` en código nuevo
- Decoradores `@Input()` / `@Output()` en código nuevo
- UI genérica sin postura estética

---

## Estructura del proyecto

```
src/
├── index.html
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
- [ ] `@if` / `@for` (no `*ngIf` / `*ngFor`)
- [ ] Tokens CSS (no hex sueltos)
- [ ] HTML semántico
- [ ] Estados: hover, focus, active, disabled
- [ ] Iconos line/stroke
- [ ] Sin fondos negros, sin emojis decorativos
- [ ] Dirección estética intencional, no genérica
