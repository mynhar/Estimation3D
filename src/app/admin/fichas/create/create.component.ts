import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ToastService } from '../../../services/toast.service';
import { FichaNormativaRepository } from '../../../data';
import { parseKeywords } from '../keywords.util';

@Component({
  selector: 'app-admin-fichas-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './create.component.html',
  styleUrls: ['../../_shared/crud-form.css'],
})
export class AdminFichasCreateComponent {
  private fb        = inject(FormBuilder);
  private router    = inject(Router);
  private toast     = inject(ToastService);
  private translate = inject(TranslateService);
  private repo      = inject(FichaNormativaRepository);

  guardando = signal(false);

  readonly langs = [
    { c: 'fr', b: 'FR' },
    { c: 'en', b: 'EN' },
    { c: 'es', b: 'ES' },
  ];

  form = this.fb.group({
    codigo:     ['', [Validators.required, Validators.pattern(/^[A-Z0-9_]+$/)]],
    titulo_fr:  ['', Validators.required],
    titulo_en:  ['', Validators.required],
    titulo_es:  ['', Validators.required],
    resumen_fr: ['', Validators.required],
    resumen_en: ['', Validators.required],
    resumen_es: ['', Validators.required],
    palabras_clave: [''],
    orden:      [0, [Validators.required, Validators.min(0)]],
    activo:     [true],
  });

  get f() { return this.form.controls; }
  /** Acceso a un control por nombre dinámico (evita el índice tipado en plantilla). */
  ctrl(name: string) { return this.form.get(name); }

  async onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.guardando.set(true);
    try {
      const v = this.form.getRawValue();
      await this.repo.crear({
        codigo:         v.codigo!.trim(),
        titulo_fr:      v.titulo_fr!.trim(),
        titulo_en:      v.titulo_en!.trim(),
        titulo_es:      v.titulo_es!.trim(),
        resumen_fr:     v.resumen_fr!.trim(),
        resumen_en:     v.resumen_en!.trim(),
        resumen_es:     v.resumen_es!.trim(),
        palabras_clave: parseKeywords(v.palabras_clave),
        orden:          Number(v.orden),
        activo:         v.activo!,
      });
      this.toast.show(this.translate.instant('admin_fichas.success_created'), 'success');
      this.router.navigate(['/admin/ficha']);
    } catch (e: any) {
      this.toast.show(this.mensaje(e), 'danger');
    } finally {
      this.guardando.set(false);
    }
  }

  cancelar() { this.router.navigate(['/admin/ficha']); }

  private mensaje(e: unknown): string {
    const raw = e instanceof Error ? e.message : '';
    if (/duplicate|unique|23505/i.test(raw)) return this.translate.instant('admin_fichas.err_codigo_dup');
    return raw || this.translate.instant('admin_fichas.err_create');
  }
}
