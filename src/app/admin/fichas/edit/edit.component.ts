import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ToastService } from '../../../services/toast.service';
import { FichaNormativaRepository, FichaNormativa } from '../../../data';
import { parseKeywords, joinKeywords } from '../keywords.util';

@Component({
  selector: 'app-admin-fichas-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './edit.component.html',
  styleUrls: ['../../_shared/crud-form.css'],
})
export class AdminFichasEditComponent implements OnInit {
  private fb        = inject(FormBuilder);
  private route     = inject(ActivatedRoute);
  private router    = inject(Router);
  private toast     = inject(ToastService);
  private translate = inject(TranslateService);
  private repo      = inject(FichaNormativaRepository);

  cargando  = signal(true);
  guardando = signal(false);
  eliminando = signal(false);
  confirmandoEliminar = signal(false);
  error     = signal<string | null>(null);
  ficha     = signal<FichaNormativa | null>(null);

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
  ctrl(name: string) { return this.form.get(name); }

  async ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.router.navigate(['/admin/ficha']); return; }
    try {
      const data = await this.repo.findById(id);
      if (!data) throw new Error(this.translate.instant('admin_fichas.err_load'));
      this.ficha.set(data);
      this.form.patchValue({
        codigo:         data.codigo,
        titulo_fr:      data.titulo_fr,
        titulo_en:      data.titulo_en,
        titulo_es:      data.titulo_es,
        resumen_fr:     data.resumen_fr,
        resumen_en:     data.resumen_en,
        resumen_es:     data.resumen_es,
        palabras_clave: joinKeywords(data.palabras_clave),
        orden:          data.orden,
        activo:         data.activo,
      });
    } catch (e: any) {
      this.error.set(e?.message ?? this.translate.instant('admin_fichas.err_load'));
    } finally {
      this.cargando.set(false);
    }
  }

  async onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const f = this.ficha();
    if (!f) return;
    this.guardando.set(true);
    try {
      const v = this.form.getRawValue();
      await this.repo.actualizar(f.id, {
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
      this.toast.show(this.translate.instant('admin_fichas.success_updated'), 'success');
      this.router.navigate(['/admin/ficha']);
    } catch (e: any) {
      this.toast.show(this.mensaje(e, 'admin_fichas.err_update'), 'danger');
    } finally {
      this.guardando.set(false);
    }
  }

  async confirmarEliminar() {
    const f = this.ficha();
    if (!f) return;
    this.eliminando.set(true);
    try {
      await this.repo.eliminar(f.id);
      this.toast.show(this.translate.instant('admin_fichas.success_deleted'), 'success');
      this.router.navigate(['/admin/ficha']);
    } catch (e: any) {
      this.toast.show(this.mensaje(e, 'admin_fichas.err_delete'), 'danger');
      this.eliminando.set(false);
      this.confirmandoEliminar.set(false);
    }
  }

  cancelar() { this.router.navigate(['/admin/ficha']); }

  private mensaje(e: unknown, fallbackKey: string): string {
    const raw = e instanceof Error ? e.message : '';
    if (/duplicate|unique|23505/i.test(raw)) return this.translate.instant('admin_fichas.err_codigo_dup');
    return raw || this.translate.instant(fallbackKey);
  }
}
