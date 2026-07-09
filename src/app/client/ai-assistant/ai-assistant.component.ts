import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AiAssistantComponent } from '../../shared/ui/ai-assistant/ai-assistant.component';

/** Asistente IA del cliente — chat contextual sobre sus propios expedientes. */
@Component({
  selector: 'app-client-ai-assistant',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AiAssistantComponent],
  template: `<app-ai-assistant [rolForzado]="'cliente'" />`,
})
export class ClientAiAssistantComponent {}
