# Design — Proyecto Angular 18 (warm editorial)

Locked design system. Future Hallmark runs read this file first; pages defer
to it. Amend intentionally — the file is the rule.

> **No theme-picking.** This system is LOCKED. Hallmark must NOT pick a new
> theme, palette, or font. It applies its quality discipline (slop-test gates,
> structural variety, anti-AI-slop rules) ON TOP of the system below.
> The detailed spec lives in `DESIGN_GUIDELINES.md`; this file is the lock.

## System
- Genre · editorial (warm-paper)
- Macrostructure · pick per brief; vary structure, keep the system
- Theme · custom (vibe: "warm editorial · beige paper · gold premium accent")
- Axes · light paper-band / serif display / warm gold accent-hue

## Tokens (canonical — `src/styles/tokens.css` is the SOURCE OF TRUTH)
> Real token names are `var(--ds-*)`. Generated code MUST use these exact
> names. Do NOT invent `--color-*` names. OKLCH below = reference value held
> by each `--ds-*` token (hex original en comentario).

```css
:root {
  --ds-bg:            oklch(96.4% 0.007 89);  /* #F5F3EE fondo principal     */
  --ds-bg-alt:        oklch(94.6% 0.010 94);  /* #EFEDE6 secciones alternas  */
  --ds-surface:       oklch(98.5% 0.005 95);  /* #FBFAF6 tarjetas, paneles   */
  --ds-ink:           oklch(21.8% 0.000 90);  /* #1A1A1A texto principal     */
  --ds-ink-secondary: oklch(40.9% 0.000 90);  /* #4A4A4A texto secundario    */
  --ds-ink-muted:     oklch(57.0% 0.011 88);  /* #7A7770 captions, hints     */
  --ds-gold:          oklch(79.3% 0.100 90);  /* #D4B96E acento dorado       */
  --ds-gold-hover:    oklch(73.8% 0.101 91);  /* #C2A85C hover botones       */
  --ds-gold-active:   oklch(68.1% 0.101 91);  /* #B0964A activos, links      */
  --ds-border:        oklch(92.2% 0.012 92);  /* #E8E5DC bordes estándar     */

  --ds-font-display: "Fraunces", ui-serif, Georgia, serif;
  --ds-font-body:    "DM Sans", ui-sans-serif, system-ui, sans-serif;

  /* Radios: botones/inputs 4–6px · cards 8px · modales 12px · chips pill.
     Nunca > 12px. Spacing: escala --ds-space-* (4px–128px), generoso.
     Type scale: --ds-text-*. Pesos: --ds-weight-*.                         */

  --ds-ease-out: cubic-bezier(0.16, 1, 0.3, 1);
  /* Sombras: --ds-shadow-* basadas en rgba(26,26,26,..), NUNCA negro puro.  */
}
```

### Dark chrome (sidebar / panel de login)
El shell usa una inversión oscura cálida intencional (espresso) contra el área
clara. Los valores viven una sola vez en `tokens.css`; los componentes los
referencian vía su capa local `--sb-*` / `--lg-*` (nunca hex crudo):
- `--ds-dark-surface` (#2A2420) · superficie oscura · `--ds-dark-surface-deep` (#221E1A)
- `--ds-danger-on-dark` (#D47A76) + `--ds-danger-on-dark-hover` (#EDAAA7) · acción peligro sobre oscuro
- Texto sobre oscuro: variaciones de opacidad de `--ds-ink-inverse` (decisión local del componente).

## CTA voice
- Primary · fill `--ds-gold` · texto `--ds-ink` · radius 4–6px · hover translateY(-1px) + shadow-gold
- Secondary · borde tinta, fondo transparente · mismo radius
- Outline-primary · borde dorado, fondo transparente

## Iconography
- **bootstrap-icons** (`bi-*`), variantes line/stroke únicamente. Nunca filled.
  (El sistema admite Lucide/Phosphor como equivalentes line, pero el stack real
  usa bootstrap-icons — mantener coherencia con `bi-*`.)

## Motion stance
- Sobria: `.fade-up` escalonado (máx 4–6 elementos por vista), `--ds-ease-out`.
- Hover botón: translateY(-1px) + shadow-gold. Hover card: shadow-md.
- Reduced-motion · ya cubierto globalmente; crossfade ≤150ms.
- PROHIBIDO: `300ms ease` por reflejo — usar tokens de duración.

## Hard bans (gates adicionales heredados del proyecto)
- Fondos negros (#000) · Bootstrap defaults sin override (#0d6efd, #6c757d)
- Gradientes morado-rosa · Inter/Roboto/Arial como principal
- Iconos filled · emojis decorativos · sombras rgba(0,0,0,..)
- border-radius > 12px en UI · UI genérica sin postura estética

## Stack output contract
- Componentes **Angular 18 standalone**, `OnPush`, signals (`input()`/`signal()`),
  nuevo control flow (`@if`/`@for` con `track`). NUNCA `*ngIf`/`*ngFor`, NgModules,
  ni `@Input()`/`@Output()`.
- CSS plano por componente con `:host` (no SCSS, no Tailwind).
- Bootstrap 5.3 personalizado primero (`.btn`, `.card`, `.row`...); CSS con tokens
  para el resto. **NO** HTML suelto ni JSX.

## Exports
`tokens.css` (`--ds-*`) es la fuente de verdad. El detalle completo (tabla de
paleta, utilidades `.eyebrow`/`.tag`/`.stat`, patrones de hero/grid) está en
`DESIGN_GUIDELINES.md`. Para Tailwind/DTCG/shadcn: este proyecto NO los usa.
