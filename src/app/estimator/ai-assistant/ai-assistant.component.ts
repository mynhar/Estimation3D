import { ChangeDetectionStrategy, Component } from '@angular/core';
import { AiAssistantComponent } from '../../shared/ui/ai-assistant/ai-assistant.component';

/** Asistente IA del estimador — apoyo técnico para diagnosticar y estimar dossiers. */
@Component({
  selector: 'app-estimator-ai-assistant',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [AiAssistantComponent],
  template: `<app-ai-assistant [rolForzado]="'estimador'" />`,
})
export class EstimatorAiAssistantComponent {}
