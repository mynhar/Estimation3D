import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ToastService } from '../../../services/toast.service';
import { ImprevistoCatalogoRepository, FichaNormativaRepository, FichaNormativa } from '../../../data';

interface ServicioOpcion { id: number; nombre: string; }

@Component({
  selector: 'app-admin-imprevistos-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './create.component.html',
  styleUrls: ['../../_shared/crud-form.css'],
})
export class AdminImprevistosCreateComponent implements OnInit {
  private fb        = inject(FormBuilder);
  private router    = inject(Router);
  private auth      = inject(AuthSupabaseService);
  private toast     = inject(ToastService);
  private translate = inject(TranslateService);
  private repo      = inject(ImprevistoCatalogoRepository);
  private fichaRepo = inject(FichaNormativaRepository);

  guardando = signal(false);
  servicios = signal<ServicioOpcion[]>([]);
  fichas    = signal<FichaNormativa[]>([]);

  readonly langs = [
    { c: 'fr', b: 'FR' },
    { c: 'en', b: 'EN' },
    { c: 'es', b: 'ES' },
  ];

  form = this.fb.group({
    servicio_id:  [''],
    codigo:       ['', [Validators.required, Validators.pattern(/^[A-Z0-9_]+$/)]],
    titulo_fr:    ['', Validators.required],
    titulo_en:    ['', Validators.required],
    titulo_es:    ['', Validators.required],
    perfil_fr:    ['', Validators.required],
    perfil_en:    ['', Validators.required],
    perfil_es:    ['', Validators.required],
    protocolo_fr: ['', Validators.required],
    protocolo_en: ['', Validators.required],
    protocolo_es: ['', Validators.required],
    requiere_aprobacion: [true],
    ficha_codigo: [''],
    orden:        [0, [Validators.required, Validators.min(0)]],
    activo:       [true],
  });

  get f() { return this.form.controls; }
  ctrl(name: string) { return this.form.get(name); }

  async ngOnInit() {
    try {
      const [{ data: servs }, fichas] = await Promise.all([
        this.auth.client.from('servicio').select('id, nombre_fr, nombre_en, nombre_es').order('id'),
        this.fichaRepo.findAll(),
      ]);
      const l = (this.translate.currentLang || 'fr').slice(0, 2);
      this.servicios.set((servs ?? []).map(s => ({
        id: s.id,
        nombre: l === 'en' ? s.nombre_en : l === 'es' ? s.nombre_es : s.nombre_fr,
      })));
      this.fichas.set(fichas.filter(fi => fi.activo));
    } catch { /* selects vacíos si falla */ }
  }

  fichaLabel(fi: FichaNormativa): string {
    const l = (this.translate.currentLang || 'fr').slice(0, 2);
    const t = l === 'en' ? fi.titulo_en : l === 'es' ? fi.titulo_es : fi.titulo_fr;
    return `${fi.codigo} · ${t}`;
  }

  async onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.guardando.set(true);
    try {
      const v = this.form.getRawValue();
      await this.repo.crear({
        servicio_id:  v.servicio_id ? Number(v.servicio_id) : null,
        codigo:       v.codigo!.trim(),
        titulo_fr:    v.titulo_fr!.trim(),
        titulo_en:    v.titulo_en!.trim(),
        titulo_es:    v.titulo_es!.trim(),
        perfil_fr:    v.perfil_fr!.trim(),
        perfil_en:    v.perfil_en!.trim(),
        perfil_es:    v.perfil_es!.trim(),
        protocolo_fr: v.protocolo_fr!.trim(),
        protocolo_en: v.protocolo_en!.trim(),
        protocolo_es: v.protocolo_es!.trim(),
        requiere_aprobacion: v.requiere_aprobacion!,
        ficha_codigo: v.ficha_codigo || null,
        orden:        Number(v.orden),
        activo:       v.activo!,
      });
      this.toast.show(this.translate.instant('admin_imprevistos.success_created'), 'success');
      this.router.navigate(['/admin/imprevisto']);
    } catch (e: any) {
      this.toast.show(this.mensaje(e), 'danger');
    } finally {
      this.guardando.set(false);
    }
  }

  cancelar() { this.router.navigate(['/admin/imprevisto']); }

  private mensaje(e: unknown): string {
    const raw = e instanceof Error ? e.message : '';
    if (/duplicate|unique|23505/i.test(raw)) return this.translate.instant('admin_imprevistos.err_codigo_dup');
    return raw || this.translate.instant('admin_imprevistos.err_create');
  }
}
