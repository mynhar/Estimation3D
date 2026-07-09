import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AiAssistantComponent } from '../../shared/ui/ai-assistant/ai-assistant.component';

/** Asistente IA del administrador — apoyo operativo para supervisar cualquier dossier. */
@Component({
  selector: 'app-admin-ai-assistant',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AiAssistantComponent],
  template: `<app-ai-assistant [rolForzado]="'administrador'" />`,
})
export class AdminAiAssistantComponent {}
