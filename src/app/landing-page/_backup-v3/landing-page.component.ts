import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LangService, Lang } from '../services/lang.service';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, TranslatePipe],
  templateUrl: './landing-page.component.html',
  styleUrl:    './landing-page.component.css',
})
export class LandingPageComponent {
  lang  = inject(LangService);
  year  = new Date().getFullYear();
  langs = this.lang.langs;

  setLang(l: Lang) { this.lang.set(l); }
}
