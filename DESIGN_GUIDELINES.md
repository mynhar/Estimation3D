# DESIGN_GUIDELINES.md

Guía de diseño y código para este proyecto. Cualquier UI nueva o modificada debe respetar lo que aquí se define. Aplica también si usas Claude Code, Copilot u otra IA para generar componentes.

---

## 1. Stack del proyecto

- **Framework**: Angular 18 (standalone components, signals, nuevo control flow)
- **Estilos**: Bootstrap 5.3 + CSS plano (NO SCSS, NO Tailwind)
- **Sistema de diseño**: tokens CSS en `src/styles/tokens.css`
- **Tipografías**: Fraunces (serif) para títulos, DM Sans para cuerpo
- **Iconos**: estilo line/stroke (Lucide o Phosphor recomendados), NUNCA filled

---

## 2. Identidad visual

### Paleta completa

La fuente de verdad es `src/styles/tokens.css`. Las tablas siguientes documentan **todos** los tokens de color disponibles. Usa siempre el token, nunca el hex suelto.

**Superficies**

| Token CSS | Hex | Uso |
|-----------|-----|-----|
| `--ds-bg` | `#F5F3EE` | Fondo principal de la app (beige cálido) |
| `--ds-bg-alt` | `#EFEDE6` | Secciones alternas |
| `--ds-surface` | `#FBFAF6` | Tarjetas, paneles (crema) |
| `--ds-surface-elevated` | `#FFFFFF` | Modales, overlays (máxima elevación) |
| `--ds-overlay` | `rgba(26,26,26,0.4)` | Backdrops detrás de modales |

**Tinta / Texto**

| Token CSS | Hex | Uso |
|-----------|-----|-----|
| `--ds-ink` | `#1A1A1A` | Texto principal |
| `--ds-ink-secondary` | `#4A4A4A` | Texto secundario |
| `--ds-ink-muted` | `#7A7770` | Texto terciario, captions, hints |
| `--ds-ink-on-accent` | `#1A1A1A` | Texto sobre fondo dorado |
| `--ds-ink-inverse` | `#FBFAF6` | Texto sobre fondos oscuros (raro) |

**Acento dorado (premium)**

| Token CSS | Hex | Uso |
|-----------|-----|-----|
| `--ds-gold` | `#D4B96E` | Dorado principal: CTAs, focus, realces |
| `--ds-gold-hover` | `#C2A85C` | Hover de botones dorados |
| `--ds-gold-active` | `#B0964A` | Estados activos/pressed, enlaces hover |
| `--ds-gold-soft` | `#EBD9A8` | Fondos sutiles, highlights |
| `--ds-gold-faint` | `#F7EFD9` | Backgrounds muy suaves |

**Bordes y separadores**

| Token CSS | Hex | Uso |
|-----------|-----|-----|
| `--ds-border` | `#E8E5DC` | Borde estándar |
| `--ds-border-strong` | `#D4D0C2` | Bordes de énfasis |
| `--ds-border-subtle` | `#EFEDE6` | Separadores muy sutiles |

**Estados semánticos** (en armonía con la paleta, NO usar los de Bootstrap)

| Token CSS | Hex | Uso |
|-----------|-----|-----|
| `--ds-success` | `#5B7A4F` | Verde oliva (éxito) |
| `--ds-success-soft` | `#E4ECDF` | Fondo de alertas de éxito |
| `--ds-warning` | `#B8862E` | Mostaza (advertencia) |
| `--ds-warning-soft` | `#F4E8CC` | Fondo de advertencias |
| `--ds-danger` | `#A14545` | Borgoña (error) |
| `--ds-danger-soft` | `#EFD9D9` | Fondo de errores |
| `--ds-info` | `#4A6B7A` | Azul pizarra (información) |
| `--ds-info-soft` | `#DBE5E9` | Fondo de avisos informativos |

### Reglas no negociables de color

- **PROHIBIDO** usar fondos negros (`#000`, `#0a0a0a`, etc.)
- **PROHIBIDO** usar Bootstrap defaults sin override (azul `#0d6efd`, gris `#6c757d`)
- **PROHIBIDO** gradientes morado-rosa o estilos "AI por defecto"
- El dorado se usa **solo** en elementos premium, hovers, focus rings y CTAs primarios
- El negro tinta `#1A1A1A` aparece **solo** como texto y bordes de botones secundarios

### Tipografía

- **Títulos** (`h1`–`h6`, `.display-*`, `.card-title`): Fraunces serif
- **Cuerpo** (texto general, botones, formularios): DM Sans
- **Monoespaciada** (código, datos tabulares): DM Mono (`--ds-font-mono`)
- **NUNCA**: Inter, Roboto, Arial, Open Sans, system fonts como principales
- **Eyebrow** (etiquetas pequeñas sobre títulos): DM Sans uppercase, `letter-spacing: 0.18em`, dorado activo

**Familias**

| Token CSS | Valor | Uso |
|-----------|-------|-----|
| `--ds-font-display` | `'Fraunces', ...serif` | Títulos |
| `--ds-font-body` | `'DM Sans', ...sans-serif` | Cuerpo, UI |
| `--ds-font-mono` | `'DM Mono', ...monospace` | Código, datos |

**Escala tipográfica** (base 16px)

| Token CSS | Tamaño | px | Uso típico |
|-----------|--------|----|----|
| `--ds-text-2xs` | `0.6875rem` | 11px | Eyebrows, labels |
| `--ds-text-xs` | `0.75rem` | 12px | Captions |
| `--ds-text-sm` | `0.875rem` | 14px | Texto auxiliar |
| `--ds-text-base` | `1rem` | 16px | Cuerpo |
| `--ds-text-lg` | `1.125rem` | 18px | Lead |
| `--ds-text-xl` | `1.375rem` | 22px | h5 |
| `--ds-text-2xl` | `1.75rem` | 28px | h4, card-title |
| `--ds-text-3xl` | `2.25rem` | 36px | h3 |
| `--ds-text-4xl` | `3rem` | 48px | h2 |
| `--ds-text-5xl` | `4rem` | 64px | h1 |
| `--ds-text-display` | `5.5rem` | 88px | Hero |

**Pesos**: `--ds-weight-regular` (400) · `--ds-weight-medium` (500) · `--ds-weight-semibold` (600) · `--ds-weight-bold` (700)

**Interlineado**: `--ds-leading-tight` (1.1, títulos) · `--ds-leading-snug` (1.25) · `--ds-leading-normal` (1.5, cuerpo) · `--ds-leading-relaxed` (1.65)

**Tracking**: `--ds-tracking-tight` (-0.02em) · `--ds-tracking-normal` (0) · `--ds-tracking-wide` (0.04em) · `--ds-tracking-widest` (0.18em, eyebrows)

### Bordes y radios

- **Botones e inputs**: `6px` (`var(--ds-radius-md)`)
- **Cards**: `8px` (`var(--ds-radius-lg)`)
- **Modales**: `12px` (`var(--ds-radius-xl)`)
- **Tags, chips, badges**: pill (`var(--ds-radius-pill)`)
- **PROHIBIDO**: radios mayores a 12px en elementos UI (no botones blob, no cards muy redondeadas)

| Token CSS | Valor | Uso |
|-----------|-------|-----|
| `--ds-radius-none` | `0` | Sin redondeo |
| `--ds-radius-sm` | `4px` | Elementos compactos |
| `--ds-radius-md` | `6px` | Botones, inputs (default) |
| `--ds-radius-lg` | `8px` | Cards |
| `--ds-radius-xl` | `12px` | Modales (máximo en UI) |
| `--ds-radius-pill` | `999px` | Tags, chips, badges |
| `--ds-radius-circle` | `50%` | Avatares |

### Espaciado

- Generoso, no aglomerar.
- Secciones: `padding-block: 4rem` mínimo, `6-8rem` en hero o secciones destacadas.
- Cards: `padding: 2rem` mínimo en body.
- Usa los tokens `--ds-space-*` (escala de 4px hasta 128px).

| Token | px | · | Token | px |
|-------|----|----|-------|----|
| `--ds-space-0` | 0 | · | `--ds-space-7` | 40px |
| `--ds-space-1` | 4px | · | `--ds-space-8` | 48px |
| `--ds-space-2` | 8px | · | `--ds-space-9` | 64px |
| `--ds-space-3` | 12px | · | `--ds-space-10` | 80px |
| `--ds-space-4` | 16px | · | `--ds-space-11` | 96px |
| `--ds-space-5` | 24px | · | `--ds-space-12` | 128px |
| `--ds-space-6` | 32px | · | | |

### Iconos

- Estilo line/stroke únicamente, `stroke-width: 1.5`
- Recomendado: **Lucide Angular** (`npm install lucide-angular`)
- Tamaños: 16, 20, 24 px según contexto
- **PROHIBIDO**: iconos rellenos (filled), emojis decorativos en UI

### Sombras

- Suaves y cálidas. Usar tokens `--ds-shadow-*` que ya están basados en `rgba(26, 26, 26, ...)`, NO en negro puro.
- En cards: shadow-xs por defecto, shadow-md en hover.
- Botones primarios en hover: `var(--ds-shadow-gold)`.

| Token CSS | Uso |
|-----------|-----|
| `--ds-shadow-xs` | Elevación mínima (cards en reposo) |
| `--ds-shadow-sm` | Elementos ligeramente elevados |
| `--ds-shadow-md` | Hover de cards, dropdowns |
| `--ds-shadow-lg` | Popovers, paneles flotantes |
| `--ds-shadow-xl` | Modales |
| `--ds-shadow-gold` | Hover de botón primario (resplandor dorado) |
| `--ds-focus-ring` | Anillo de foco dorado accesible (`:focus-visible`) |

### Motion y transiciones

- Usa siempre los tokens, nunca `300ms ease` por reflejo.
- Curvas: `--ds-ease-out` (entradas, la mayoría) · `--ds-ease-in-out` (bucles, ida y vuelta).
- Duraciones: `--ds-duration-fast` (150ms) · `--ds-duration-base` (250ms) · `--ds-duration-slow` (400ms).
- Atajo: `--ds-transition-color` para hovers de color/fondo/borde.
- `prefers-reduced-motion` ya está cubierto globalmente en `tokens.css`.

### Elevación y layout (z-index, containers)

- **z-index** — usa la escala, nunca números mágicos: `--ds-z-base` (1) · `--ds-z-dropdown` (100) · `--ds-z-sticky` (200) · `--ds-z-overlay` (900) · `--ds-z-modal` (1000) · `--ds-z-toast` (1100).
- **Anchos de container**: `--ds-container-sm` (640px) · `--ds-container-md` (768px) · `--ds-container-lg` (1024px) · `--ds-container-xl` (1280px) · `--ds-container-2xl` (1440px). El `.container` de Bootstrap limita a 1200px para el contenido general.

---

## 3. Convenciones de Angular 18

### Componentes

- **SIEMPRE standalone** (sin NgModules nuevos)
- **SIEMPRE** `ChangeDetectionStrategy.OnPush`
- Usa la nueva API de signals: `input()`, `output()`, `signal()`, `computed()`, `effect()`
- **NO uses** los decoradores `@Input()` / `@Output()` para código nuevo
- Naming: `kebab-case.component.ts`

```typescript
// CORRECTO
import { Component, ChangeDetectionStrategy, input, signal } from '@angular/core';

@Component({
  selector: 'app-product-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './product-card.component.html',
  styleUrl: './product-card.component.css'
})
export class ProductCardComponent {
  title = input.required<string>();
  price = input<number>(0);
  protected isFavorite = signal(false);
}
```

### Templates

- Usa **nuevo control flow**: `@if`, `@for`, `@switch`, `@defer`
- **NO uses** `*ngIf`, `*ngFor`, `*ngSwitch`
- `track` obligatorio en `@for`
- `@defer` para secciones pesadas o below-the-fold

```html
<!-- CORRECTO -->
@if (products().length > 0) {
  <div class="row g-4">
    @for (product of products(); track product.id) {
      <div class="col-md-4">
        <app-product-card [title]="product.title" [price]="product.price" />
      </div>
    }
  </div>
} @else {
  <p class="text-ink-muted">No hay productos disponibles.</p>
}

@defer (on viewport) {
  <app-reviews-section />
} @placeholder {
  <div class="placeholder-card"></div>
}
```

### Estilos del componente

- Un archivo `.css` por componente (NO SCSS).
- Usa siempre tokens CSS (`var(--ds-...)`), no hex sueltos.
- El selector raíz es `:host` (no el nombre del componente).

```css
/* product-card.component.css */
:host {
  display: block;
}

.product-card__title {
  font-family: var(--ds-font-display);
  font-size: var(--ds-text-2xl);
  color: var(--ds-ink);
  margin-bottom: var(--ds-space-3);
}

.product-card__price {
  color: var(--ds-gold-active);
  font-weight: var(--ds-weight-semibold);
}
```

---

## 4. Uso de Bootstrap 5

Bootstrap está **personalizado** mediante `src/styles/bootstrap-overrides.css`. Sus clases nativas heredan automáticamente la identidad visual.

### Clases de Bootstrap que SÍ debes usar

- **Grid**: `.container`, `.row`, `.col-*`, `.g-*`
- **Flexbox**: `.d-flex`, `.align-items-*`, `.justify-content-*`, `.gap-*`
- **Spacing**: `.m-*`, `.p-*`, `.mt-*`, etc.
- **Componentes base**: `.btn`, `.card`, `.form-control`, `.alert`, `.navbar`, `.table`, `.modal`, `.dropdown`, `.badge`
- **Responsive**: `.d-md-flex`, `.col-lg-*`, etc.

### Clases de Bootstrap que NO debes usar

- `.bg-dark` (rompe la regla de no fondos negros)
- `.text-white` excepto sobre `--ds-ink` (raro)
- `.bg-primary` como fondo grande de sección (el dorado es acento, no fondo)
- `.rounded-circle` excepto en avatares
- `.shadow-lg` de Bootstrap (usa los tokens propios)

### Botones

```html
<!-- Primario: dorado con tinta oscura. Para CTAs principales -->
<button class="btn btn-primary">Reservar</button>

<!-- Secundario: borde tinta, fondo transparente. Para acciones alternas -->
<button class="btn btn-secondary">Ver detalles</button>

<!-- Outline primario: borde dorado, fondo transparente -->
<button class="btn btn-outline-primary">Suscribirme</button>

<!-- Link con underline animado -->
<a href="#" class="btn-link">Saber más</a>
```

### Cards

```html
<div class="card">
  <div class="card-body">
    <h3 class="card-title">Título</h3>
    <p class="card-subtitle">Subtítulo</p>
    <p class="text-ink-secondary">Contenido principal.</p>
  </div>
</div>

<!-- Card premium con barra dorada superior -->
<div class="card card-premium">
  <div class="card-body">
    <span class="tag tag-gold">Destacado</span>
    <h3 class="card-title">Pieza exclusiva</h3>
  </div>
</div>
```

### Formularios

```html
<div class="mb-3">
  <label class="form-label">Nombre</label>
  <input type="text" class="form-control" placeholder="Tu nombre">
  <small class="form-text">Cómo te gustaría que te llamemos.</small>
</div>
```

---

## 5. Utilidades del sistema (en `components.css`)

Además de Bootstrap, tienes estas utilidades propias:

### Texto
- `.eyebrow` — etiqueta uppercase dorada sobre títulos
- `.title-editorial em` — palabra acentuada en cursiva dorada dentro de un título
- `.text-ink`, `.text-ink-secondary`, `.text-ink-muted`, `.text-gold`
- `.font-display`, `.font-body`
- `.tracking-tight`, `.tracking-wide`, `.tracking-widest`

### Layout y secciones
- `.section`, `.section-sm`, `.section-lg` — secciones con padding generoso
- `.section-alt` — fondo `--ds-bg-alt` para secciones alternas

### Componentes
- `.tag`, `.tag-gold` — chips/etiquetas pill
- `.stat`, `.stat__value`, `.stat__label` — números grandes con etiqueta
- `.divider-dot` — separador con punto dorado central
- `.link-underline` — enlace con animación de subrayado
- `.card-premium` — card con barra dorada superior
- `.icon` — wrapper para SVG line (fuerza stroke, no fill)
- `.fade-up` — animación de entrada con `--delay` configurable

---

## 6. Patrones obligatorios para cada componente nuevo

Antes de cerrar un componente, verifica que:

- [ ] Es standalone con `ChangeDetectionStrategy.OnPush`
- [ ] Usa `input()` / `output()` / `signal()`, no decoradores antiguos
- [ ] Usa `@if` / `@for`, no `*ngIf` / `*ngFor`
- [ ] Tiene **dirección estética clara** (no es "genérico bonito")
- [ ] Usa tokens CSS (`var(--ds-...)`), no hex sueltos
- [ ] HTML semántico (`<button>`, `<nav>`, `<main>`, no `<div onclick>`)
- [ ] Estados visibles: hover, focus, active, disabled, loading
- [ ] Focus visible con `:focus-visible` (ya cubierto por el sistema)
- [ ] Contraste WCAG AA (4.5:1 mínimo en texto)
- [ ] Respeta `prefers-reduced-motion` (ya cubierto globalmente)
- [ ] Iconos line/stroke, no filled
- [ ] No usa emojis decorativos
- [ ] No usa fondos negros

---

## 7. Composición y layout

### Secciones

- Usa `<section class="section">` o `section-lg` para bloques de página.
- Alterna `.section-alt` con `.section` plana para crear ritmo visual.
- Usa el `.container` de Bootstrap para limitar ancho a 1200px.

### Hero

- Asimetría preferida sobre composición centrada perfecta.
- Una palabra clave del título en `<em>` para destacarla en cursiva dorada.
- Eyebrow + título grande + lead + CTAs (primario + secundario).
- Animación `fade-up` escalonada con `--delay` incremental (0, 100ms, 250ms, 400ms).

### Grids

- Grid Bootstrap de 12 columnas como base.
- Rompe la simetría a veces: combina `col-lg-5 + col-lg-7`, no siempre `4-4-4`.
- `gap` generoso entre items: `g-4` mínimo, `g-5` en secciones amplias.

---

## 8. Animación

- **Animaciones de entrada**: usa `.fade-up` con `--delay` escalonado en elementos del hero o secciones destacadas. No abuses: máximo 4-6 elementos animados por vista.
- **Hover en botones primarios**: `transform: translateY(-1px)` + sombra dorada. Ya viene en el sistema.
- **Hover en cards**: `box-shadow: var(--ds-shadow-md)`. Ya viene en el sistema.
- **View Transitions** del router: activarlas en `app.config.ts` con `withViewTransitions()`.
- **PROHIBIDO**: animaciones de `300ms ease` por reflejo. Usa `var(--ds-ease-out)` y duraciones de los tokens.

```typescript
// app.config.ts
import { provideRouter, withViewTransitions } from '@angular/router';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes, withViewTransitions()),
    // ...
  ]
};
```

---

## 9. Performance

- `@defer` para todo lo que no es crítico above-the-fold (modales, gráficos, mapas, secciones de footer).
- `NgOptimizedImage` para todas las imágenes.
- Signals en lugar de RxJS para estado local simple.
- Lazy load de rutas con `loadComponent`.

```typescript
// app.routes.ts
export const routes: Routes = [
  {
    path: 'productos',
    loadComponent: () => import('./features/products/products.component')
      .then(m => m.ProductsComponent)
  }
];
```

---

## 10. Estructura de carpetas recomendada

```
src/
├── index.html              ← fuentes de Google aquí
├── styles.css              ← overrides puntuales (mantener mínimo)
├── styles/
│   ├── tokens.css          ← variables del sistema
│   ├── bootstrap-overrides.css
│   └── components.css      ← utilidades propias
└── app/
    ├── core/               ← servicios singleton, interceptors, guards
    ├── shared/             ← componentes/directivas/pipes reutilizables
    │   ├── ui/             ← botones, cards, inputs, modales propios
    │   └── layout/         ← navbar, footer, shells
    ├── features/           ← funcionalidad por dominio
    │   ├── products/
    │   ├── checkout/
    │   └── account/
    └── app.config.ts
```

---

## 11. Comandos del proyecto

```bash
# Dev server
ng serve

# Build producción
ng build

# Crear componente con las reglas del proyecto
ng generate component shared/ui/button --standalone --change-detection OnPush --style css

# Tests
ng test
```

---

## 12. Lo que NUNCA hacemos en este proyecto

- Fondos negros o `#000`
- Gradientes morado-rosa
- Fuentes Inter / Roboto / Arial como principales
- Iconos filled o emojis decorativos
- `*ngIf` / `*ngFor` / `*ngSwitch` en código nuevo
- Decoradores `@Input()` / `@Output()` en código nuevo
- NgModules nuevos (todo standalone)
- Componentes sin `OnPush`
- Estilos sin tokens CSS (no `color: #1A1A1A`, sí `color: var(--ds-ink)`)
- UI genérica sin postura estética
- Hex de Bootstrap defaults (`#0d6efd`, `#6c757d`, etc.)
- Colores de estado de Bootstrap (`.text-success`, `.bg-danger`...) — usa los tokens `--ds-success/warning/danger/info`
- `z-index` con números mágicos — usa la escala `--ds-z-*`
- `border-radius` mayor a 12px en elementos UI
- Sombras con `rgba(0, 0, 0, ...)` — usa `rgba(26, 26, 26, ...)` o los tokens
- Densidad agresiva (`padding: 0.25rem`) sin justificación

---

## 13. Cuando pidas ayuda a una IA (Claude, Copilot, etc.)

Si trabajas con asistentes de IA en este proyecto, dales este archivo como contexto. Una buena instrucción inicial sería:

> "Trabajo en un proyecto Angular 18 con Bootstrap 5 y CSS plano. Sigue estrictamente las reglas de `DESIGN_GUIDELINES.md`. Antes de generar código, identifica qué tokens CSS y componentes del sistema vas a usar. No uses fondos negros, no uses gradientes morados, no uses Inter/Roboto, no uses `*ngIf`/`*ngFor`, no uses NgModules. Usa standalone components con OnPush, signals, nuevo control flow, y los tokens del sistema."
