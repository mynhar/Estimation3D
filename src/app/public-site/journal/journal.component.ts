import {
  ChangeDetectionStrategy, Component, ViewEncapsulation, computed, signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { RevealDirective } from '../../landing-page/directives/reveal.directive';
import { SweepDirective } from '../../landing-page/directives/sweep.directive';
import { SitePageBase } from '../site-page.base';
import { JOURNAL_CARDS, JOURNAL_CATS, JournalCat } from './journal.data';

/**
 * Le Journal — página pública (sin guard). Puerto de
 * `Estimation3D - Journal.html`.
 *
 * El filtro por categoría del original ocultaba fichas con `style.display`;
 * aquí es una signal derivada, así que la rejilla sólo contiene las fichas
 * visibles y el lector de pantalla no anuncia las ocultas.
 */
@Component({
  selector: 'app-journal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
  imports: [RouterLink, TranslatePipe, RevealDirective, SweepDirective],
  templateUrl: './journal.component.html',
  styleUrls: ['../styles/site-chrome.css', './journal.component.css'],
  host: {
    'class': 'e3-public-page',
    '[attr.data-theme]': 'theme()',
  },
})
export class JournalComponent extends SitePageBase {
  readonly year = new Date().getFullYear();

  readonly cats = JOURNAL_CATS;
  readonly activeCat = signal<JournalCat>('all');

  readonly cards = computed(() => {
    const cat = this.activeCat();
    return cat === 'all' ? JOURNAL_CARDS : JOURNAL_CARDS.filter(c => c.cat === cat);
  });

  setCat(cat: JournalCat): void { this.activeCat.set(cat); }
}
