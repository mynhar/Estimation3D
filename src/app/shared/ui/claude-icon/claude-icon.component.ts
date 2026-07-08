import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Marca de Claude (Anthropic) — ráfaga radial en el color de marca.
 * Icono line/stroke para representar el Asistente IA en la navegación.
 */
@Component({
  selector: 'app-claude-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"
         stroke-width="1.5" stroke-linecap="round">
      <line x1="12" y1="12" x2="21"    y2="12" />
      <line x1="12" y1="12" x2="18.5"  y2="15.75" />
      <line x1="12" y1="12" x2="16.75" y2="20.23" />
      <line x1="12" y1="12" x2="12"    y2="19.5" />
      <line x1="12" y1="12" x2="7.25"  y2="20.23" />
      <line x1="12" y1="12" x2="5.5"   y2="15.75" />
      <line x1="12" y1="12" x2="3"     y2="12" />
      <line x1="12" y1="12" x2="5.5"   y2="8.25" />
      <line x1="12" y1="12" x2="7.25"  y2="3.77" />
      <line x1="12" y1="12" x2="12"    y2="4.5" />
      <line x1="12" y1="12" x2="16.75" y2="3.77" />
      <line x1="12" y1="12" x2="18.5"  y2="8.25" />
    </svg>
  `,
  styles: [`
    :host {
      --claude-brand: #D97757;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    svg {
      width: 1.125rem;
      height: 1.125rem;
      stroke: var(--claude-brand);
    }
  `],
})
export class ClaudeIconComponent {}
