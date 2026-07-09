import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AiAssistantComponent } from '../../shared/ui/ai-assistant/ai-assistant.component';

/** Asistente IA del constructor — apoyo para entender el alcance y preparar ofertas. */
@Component({
  selector: 'app-builder-ai-assistant',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AiAssistantComponent],
  template: `<app-ai-assistant [rolForzado]="'constructor'" />`,
})
export class BuilderAiAssistantComponent {}
