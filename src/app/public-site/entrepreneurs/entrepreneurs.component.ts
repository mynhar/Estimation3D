import {
  ChangeDetectionStrategy, Component, ViewEncapsulation, inject, signal,
} from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

import { RevealDirective } from '../../landing-page/directives/reveal.directive';
import { SweepDirective } from '../../landing-page/directives/sweep.directive';
import { SitePageBase } from '../site-page.base';
import {
  BENEFITS, FAQ_IDS, FORM_SPECIALTIES, PROBLEM_CELLS, REQUIREMENTS,
  SPECIALTY_SLOTS, STEPS,
} from './entrepreneurs.data';

/**
 * Entrepreneurs — página pública (sin guard). Puerto de
 * `Estimation3D - Entrepreneurs.html`.
 *
 * Dos cambios respecto al original, ambos por la misma razón — no medir el DOM
 * desde TypeScript:
 *  · el acordeón de FAQ guarda el id abierto en una signal, y el CSS anima con
 *    `grid-template-rows: 0fr → 1fr` en vez de escribir `maxHeight = scrollHeight`;
 *  · el formulario es reactivo y valida en el cliente antes de enviar.
 */
@Component({
  selector: 'app-entrepreneurs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.Emulated,
  imports: [RouterLink, TranslatePipe, ReactiveFormsModule, RevealDirective, SweepDirective],
  templateUrl: './entrepreneurs.component.html',
  styleUrls: ['../styles/site-chrome.css', './entrepreneurs.component.css'],
  host: {
    'class': 'e3-public-page',
    '[attr.data-theme]': 'theme()',
  },
})
export class EntrepreneursComponent extends SitePageBase {
  private fb = inject(FormBuilder);

  readonly year = new Date().getFullYear();

  readonly problemCells = PROBLEM_CELLS;
  readonly steps = STEPS;
  readonly benefits = BENEFITS;
  readonly requirements = REQUIREMENTS;
  readonly specialtySlots = SPECIALTY_SLOTS;
  readonly faqIds = FAQ_IDS;
  readonly formSpecialties = FORM_SPECIALTIES;

  /** Id de la pregunta abierta; `null` cuando todas están cerradas. */
  readonly openFaq = signal<string | null>(null);

  readonly form = this.fb.nonNullable.group({
    entreprise: ['', Validators.required],
    contact: ['', Validators.required],
    telephone: ['', Validators.required],
    courriel: ['', [Validators.required, Validators.email]],
    rbq: ['', Validators.required],
    specialites: this.fb.nonNullable.control<string[]>([]),
    annees: this.fb.nonNullable.control<number | null>(null),
    zone: [''],
    message: [''],
  });

  /** Marca los campos con error sólo después del primer intento de envío. */
  readonly submitted = signal(false);
  readonly sent = signal(false);

  toggleFaq(id: string): void {
    this.openFaq.update(cur => (cur === id ? null : id));
  }

  toggleSpecialty(option: string, checked: boolean): void {
    const ctrl = this.form.controls.specialites;
    const list = ctrl.value;
    ctrl.setValue(checked ? [...list, option] : list.filter(v => v !== option));
  }

  hasSpecialty(option: string): boolean {
    return this.form.controls.specialites.value.includes(option);
  }

  /** true cuando hay que pintar el campo en rojo. */
  invalid(name: keyof typeof this.form.controls): boolean {
    const c = this.form.controls[name];
    return c.invalid && (c.touched || this.submitted());
  }

  submit(): void {
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.host.querySelector<HTMLElement>('.field .is-invalid')?.focus();
      return;
    }

    // TODO(backend): todavía no existe tabla de candidaturas de entrepreneurs en
    // Supabase. Cuando exista, enviar aquí this.form.getRawValue() y esperar la
    // respuesta antes de mostrar el estado de éxito.
    this.sent.set(true);
  }
}
