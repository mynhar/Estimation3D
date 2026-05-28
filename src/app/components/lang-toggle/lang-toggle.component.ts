import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LangService } from '../../services/lang.service';

@Component({
  selector: 'app-lang-toggle',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './lang-toggle.component.html',
  styleUrl: './lang-toggle.component.css',
})
export class LangToggleComponent {
  compact = input(false);
  langSvc = inject(LangService);
}
