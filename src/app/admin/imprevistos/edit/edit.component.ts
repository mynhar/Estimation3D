import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ToastService } from '../../../services/toast.service';
import { ImprevistoCatalogoRepository, ImprevistoCatalogo, FichaNormativaRepository, FichaNormativa } from '../../../data';

interface ServicioOpcion { id: number; nombre: string; }

@Component({
  selector: 'app-admin-imprevistos-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './edit.component.html',
  styleUrls: ['../../_shared/crud-form.css'],
})
export class AdminImprevistosEditComponent implements OnInit {
  private fb        = inject(FormBuilder);
  private route     = inject(ActivatedRoute);
  private router    = inject(Router);
  private auth      = inject(AuthSupabaseService);
  private toast     = inject(ToastService);
  private translate = inject(TranslateService);
  private repo      = inject(ImprevistoCatalogoRepository);
  private fichaRepo = inject(FichaNormativaRepository);

  cargando  = signal(true);
  guardando = signal(false);
  eliminando = signal(false);
  confirmandoEliminar = signal(false);
  error     = signal<string | null>(null);
  item      = signal<ImprevistoCatalogo | null>(null);
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
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.router.navigate(['/admin/imprevisto']); return; }
    try {
      const [item, { data: servs }, fichas] = await Promise.all([
        this.repo.findById(id),
        this.auth.client.from('servicio').select('id, nombre_fr, nombre_en, nombre_es').order('id'),
        this.fichaRepo.findAll(),
      ]);
      if (!item) throw new Error(this.translate.instant('admin_imprevistos.err_load'));

      const l = (this.translate.currentLang || 'fr').slice(0, 2);
      this.servicios.set((servs ?? []).map(s => ({
        id: s.id, nombre: l === 'en' ? s.nombre_en : l === 'es' ? s.nombre_es : s.nombre_fr,
      })));
      this.fichas.set(fichas.filter(fi => fi.activo || fi.codigo === item.ficha_codigo));

      this.item.set(item);
      this.form.patchValue({
        servicio_id:  item.servicio_id != null ? String(item.servicio_id) : '',
        codigo:       item.codigo,
        titulo_fr:    item.titulo_fr,
        titulo_en:    item.titulo_en,
        titulo_es:    item.titulo_es,
        perfil_fr:    item.perfil_fr,
        perfil_en:    item.perfil_en,
        perfil_es:    item.perfil_es,
        protocolo_fr: item.protocolo_fr,
        protocolo_en: item.protocolo_en,
        protocolo_es: item.protocolo_es,
        requiere_aprobacion: item.requiere_aprobacion,
        ficha_codigo: item.ficha_codigo ?? '',
        orden:        item.orden,
        activo:       item.activo,
      });
    } catch (e: any) {
      this.error.set(e?.message ?? this.translate.instant('admin_imprevistos.err_load'));
    } finally {
      this.cargando.set(false);
    }
  }

  fichaLabel(fi: FichaNormativa): string {
    const l = (this.translate.currentLang || 'fr').slice(0, 2);
    const t = l === 'en' ? fi.titulo_en : l === 'es' ? fi.titulo_es : fi.titulo_fr;
    return `${fi.codigo} · ${t}`;
  }

  async onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const it = this.item();
    if (!it) return;
    this.guardando.set(true);
    try {
      const v = this.form.getRawValue();
      await this.repo.actualizar(it.id, {
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
      this.toast.show(this.translate.instant('admin_imprevistos.success_updated'), 'success');
      this.router.navigate(['/admin/imprevisto']);
    } catch (e: any) {
      this.toast.show(this.mensaje(e, 'admin_imprevistos.err_update'), 'danger');
    } finally {
      this.guardando.set(false);
    }
  }

  async confirmarEliminar() {
    const it = this.item();
    if (!it) return;
    this.eliminando.set(true);
    try {
      await this.repo.eliminar(it.id);
      this.toast.show(this.translate.instant('admin_imprevistos.success_deleted'), 'success');
      this.router.navigate(['/admin/imprevisto']);
    } catch (e: any) {
      this.toast.show(this.mensaje(e, 'admin_imprevistos.err_delete'), 'danger');
      this.eliminando.set(false);
      this.confirmandoEliminar.set(false);
    }
  }

  cancelar() { this.router.navigate(['/admin/imprevisto']); }

  private mensaje(e: unknown, fallbackKey: string): string {
    const raw = e instanceof Error ? e.message : '';
    if (/duplicate|unique|23505/i.test(raw)) return this.translate.instant('admin_imprevistos.err_codigo_dup');
    return raw || this.translate.instant(fallbackKey);
  }
}
