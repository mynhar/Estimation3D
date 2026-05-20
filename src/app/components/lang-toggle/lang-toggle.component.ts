import { Component, inject, Input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LangService } from '../../services/lang.service';

@Component({
  selector: 'app-lang-toggle',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './lang-toggle.component.html',
  styleUrl: './lang-toggle.component.css',
})
export class LangToggleComponent {
  @Input() compact = false;
  langSvc = inject(LangService);
}
