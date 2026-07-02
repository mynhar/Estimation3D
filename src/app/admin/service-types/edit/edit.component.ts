import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ToastService } from '../../../services/toast.service';
import { FaseServicioRepository } from '../../../data/fase-servicio.repository';
import { ActividadServicioRepository } from '../../../data/actividad-servicio.repository';
import { FaseServicio, ActividadServicio } from '../../../models/seguimiento.model';

interface Servicio {
  id:             number;
  codigo:         string;
  nombre_fr:      string;
  nombre_en:      string;
  nombre_es:      string;
  descripcion_fr: string | null;
  descripcion_en: string | null;
  descripcion_es: string | null;
  activo:         boolean;
}

@Component({
  selector: 'app-admin-service-type-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './edit.component.html',
  styleUrl:    './edit.component.css',
})
export class AdminServiceTypeEditComponent implements OnInit {
  private fb        = inject(FormBuilder);
  private route     = inject(ActivatedRoute);
  private router    = inject(Router);
  private auth      = inject(AuthSupabaseService);
  private toast     = inject(ToastService);
  private translate = inject(TranslateService);
  private faseRepo  = inject(FaseServicioRepository);
  private actiRepo  = inject(ActividadServicioRepository);

  cargando  = signal(true);
  guardando = signal(false);
  error     = signal<string | null>(null);
  servicio  = signal<Servicio | null>(null);

  // ── Estado del panel de fases ──────────────────────────────────────────────
  fases                 = signal<FaseServicio[]>([]);
  cargandoFases         = signal(false);
  errorFases            = signal<string | null>(null);
  guardandoFase         = signal(false);
  eliminandoId          = signal<string | null>(null);
  faseFormAbierto       = signal(false);
  faseEditandoId        = signal<string | null>(null);
  confirmandoEliminarId = signal<string | null>(null);

  // ── Estado del panel de actividades ─────────────────────────────────────────
  actividades                 = signal<ActividadServicio[]>([]);
  cargandoActividades         = signal(false);
  errorActividades            = signal<string | null>(null);
  guardandoActividad          = signal(false);
  eliminandoActividadId       = signal<string | null>(null);
  actividadFormAbierto        = signal(false);
  actividadEditandoId         = signal<string | null>(null);
  confirmandoEliminarActiId   = signal<string | null>(null);

  form = this.fb.group({
    nombre_fr:      ['', Validators.required],
    nombre_en:      ['', Validators.required],
    nombre_es:      ['', Validators.required],
    descripcion_fr: [''],
    descripcion_en: [''],
    descripcion_es: [''],
    activo:         [true],
  });

  faseForm = this.fb.group({
    codigo:         ['', [Validators.required, Validators.pattern(/^[a-z0-9_]+$/)]],
    orden:          [1,  [Validators.required, Validators.min(1)]],
    nombre_fr:      ['', Validators.required],
    nombre_en:      ['', Validators.required],
    nombre_es:      ['', Validators.required],
    descripcion_fr: [''],
    descripcion_en: [''],
    descripcion_es: [''],
    activo:         [true],
  });

  actividadForm = this.fb.group({
    codigo:    ['', [Validators.required, Validators.pattern(/^[a-z0-9_]+$/)]],
    fase_id:   [''],
    nombre_fr: ['', Validators.required],
    nombre_en: ['', Validators.required],
    nombre_es: ['', Validators.required],
    activo:    [true],
  });

  get f()  { return this.form.controls; }
  get ff() { return this.faseForm.controls; }
  get fa() { return this.actividadForm.controls; }

  async ngOnInit() {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (!id) { this.router.navigate(['/admin/service-type']); return; }

    try {
      const { data, error } = await this.auth.client
        .from('servicio')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data)  throw new Error(this.translate.instant('admin_service_types.err_load'));

      this.servicio.set(data as Servicio);
      this.form.patchValue({
        nombre_fr:      data.nombre_fr,
        nombre_en:      data.nombre_en,
        nombre_es:      data.nombre_es,
        descripcion_fr: data.descripcion_fr ?? '',
        descripcion_en: data.descripcion_en ?? '',
        descripcion_es: data.descripcion_es ?? '',
        activo:         data.activo,
      });

      // Cargar catálogos del servicio (cada uno gestiona su error, no bloquean el form).
      await Promise.all([this.cargarFases(), this.cargarActividades()]);
    } catch (e: unknown) {
      this.error.set(this.mensaje(e, 'admin_service_types.err_load'));
    } finally {
      this.cargando.set(false);
    }
  }

  async onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const s = this.servicio();
    if (!s) return;

    this.guardando.set(true);
    try {
      const v = this.form.getRawValue();
      const { error } = await this.auth.client
        .from('servicio')
        .update({
          nombre_fr:      v.nombre_fr!,
          nombre_en:      v.nombre_en!,
          nombre_es:      v.nombre_es!,
          descripcion_fr: v.descripcion_fr || null,
          descripcion_en: v.descripcion_en || null,
          descripcion_es: v.descripcion_es || null,
          activo:         v.activo!,
        })
        .eq('id', s.id);

      if (error) throw error;

      this.toast.show(
        this.translate.instant('admin_service_types.success_updated'),
        'success',
      );
      this.router.navigate(['/admin/service-type']);
    } catch (e: unknown) {
      this.toast.show(this.mensaje(e, 'admin_service_types.err_update'), 'danger');
    } finally {
      this.guardando.set(false);
    }
  }

  cancelar() {
    this.router.navigate(['/admin/service-type']);
  }

  // ════════════════════════════════════════════════════════════════════════
  //  FASES DEL SERVICIO
  // ════════════════════════════════════════════════════════════════════════

  /** Nombre de la fase en el idioma activo. */
  nombreFase(fase: FaseServicio): string {
    const lang = (this.translate.currentLang || this.translate.defaultLang || 'fr').slice(0, 2);
    if (lang === 'en') return fase.nombre_en;
    if (lang === 'es') return fase.nombre_es;
    return fase.nombre_fr;
  }

  async cargarFases() {
    const s = this.servicio();
    if (!s) return;

    this.cargandoFases.set(true);
    this.errorFases.set(null);
    try {
      this.fases.set(await this.faseRepo.findByServicio(s.id));
    } catch (e: unknown) {
      this.errorFases.set(this.mensaje(e, 'admin_service_types.fases.err_load'));
    } finally {
      this.cargandoFases.set(false);
    }
  }

  /** Abre el formulario en blanco para crear una fase (orden = siguiente). */
  nuevaFase() {
    const siguienteOrden = this.fases().reduce((max, x) => Math.max(max, x.orden), 0) + 1;
    this.faseEditandoId.set(null);
    this.confirmandoEliminarId.set(null);
    this.faseForm.reset({
      codigo: '', orden: siguienteOrden,
      nombre_fr: '', nombre_en: '', nombre_es: '',
      descripcion_fr: '', descripcion_en: '', descripcion_es: '',
      activo: true,
    });
    this.faseFormAbierto.set(true);
  }

  /** Abre el formulario con los datos de una fase existente. */
  editarFase(fase: FaseServicio) {
    this.faseEditandoId.set(fase.id);
    this.confirmandoEliminarId.set(null);
    this.faseForm.reset({
      codigo:         fase.codigo,
      orden:          fase.orden,
      nombre_fr:      fase.nombre_fr,
      nombre_en:      fase.nombre_en,
      nombre_es:      fase.nombre_es,
      descripcion_fr: fase.descripcion_fr ?? '',
      descripcion_en: fase.descripcion_en ?? '',
      descripcion_es: fase.descripcion_es ?? '',
      activo:         fase.activo,
    });
    this.faseFormAbierto.set(true);
  }

  cancelarFase() {
    this.faseFormAbierto.set(false);
    this.faseEditandoId.set(null);
  }

  async guardarFase() {
    if (this.faseForm.invalid) { this.faseForm.markAllAsTouched(); return; }
    const s = this.servicio();
    if (!s) return;

    const v = this.faseForm.getRawValue();
    const payload = {
      servicio_id:    s.id,
      codigo:         v.codigo!.trim(),
      orden:          Number(v.orden),
      nombre_fr:      v.nombre_fr!.trim(),
      nombre_en:      v.nombre_en!.trim(),
      nombre_es:      v.nombre_es!.trim(),
      descripcion_fr: v.descripcion_fr?.trim() || null,
      descripcion_en: v.descripcion_en?.trim() || null,
      descripcion_es: v.descripcion_es?.trim() || null,
      activo:         v.activo!,
    };

    this.guardandoFase.set(true);
    try {
      const editId = this.faseEditandoId();
      if (editId) {
        const actualizada = await this.faseRepo.actualizar(editId, payload);
        this.fases.update(list =>
          list.map(x => x.id === editId ? actualizada : x).sort(porOrden));
        this.toast.show(this.translate.instant('admin_service_types.fases.success_updated'), 'success');
      } else {
        const creada = await this.faseRepo.crear(payload);
        this.fases.update(list => [...list, creada].sort(porOrden));
        this.toast.show(this.translate.instant('admin_service_types.fases.success_created'), 'success');
      }
      this.faseFormAbierto.set(false);
      this.faseEditandoId.set(null);
    } catch (e: unknown) {
      this.toast.show(this.mensajeFase(e), 'danger');
    } finally {
      this.guardandoFase.set(false);
    }
  }

  pedirEliminar(fase: FaseServicio) { this.confirmandoEliminarId.set(fase.id); }
  cancelarEliminar()                { this.confirmandoEliminarId.set(null); }

  async confirmarEliminar(fase: FaseServicio) {
    this.eliminandoId.set(fase.id);
    try {
      await this.faseRepo.eliminar(fase.id);
      this.fases.update(list => list.filter(x => x.id !== fase.id));
      this.confirmandoEliminarId.set(null);
      if (this.faseEditandoId() === fase.id) this.cancelarFase();
      // La BD pone fase_id = null en las actividades que referenciaban esta fase.
      void this.cargarActividades();
      this.toast.show(this.translate.instant('admin_service_types.fases.success_deleted'), 'success');
    } catch (e: unknown) {
      this.toast.show(this.mensajeFase(e), 'danger');
    } finally {
      this.eliminandoId.set(null);
    }
  }

  // ════════════════════════════════════════════════════════════════════════
  //  ACTIVIDADES DEL SERVICIO
  // ════════════════════════════════════════════════════════════════════════

  /** Nombre (idioma activo) de una entidad multilingüe. */
  private nombreLocal(x: { nombre_fr: string; nombre_en: string; nombre_es: string }): string {
    const lang = (this.translate.currentLang || this.translate.defaultLang || 'fr').slice(0, 2);
    if (lang === 'en') return x.nombre_en;
    if (lang === 'es') return x.nombre_es;
    return x.nombre_fr;
  }

  nombreActividad(acti: ActividadServicio): string { return this.nombreLocal(acti); }

  /** Nombre de la fase vinculada a una actividad, o null si no tiene. */
  nombreFaseVinculada(faseId: string | null): string | null {
    if (!faseId) return null;
    const fase = this.fases().find(x => x.id === faseId);
    return fase ? this.nombreLocal(fase) : null;
  }

  async cargarActividades() {
    const s = this.servicio();
    if (!s) return;

    this.cargandoActividades.set(true);
    this.errorActividades.set(null);
    try {
      this.actividades.set(await this.actiRepo.findByServicio(s.id));
    } catch (e: unknown) {
      this.errorActividades.set(this.mensaje(e, 'admin_service_types.actividades.err_load'));
    } finally {
      this.cargandoActividades.set(false);
    }
  }

  nuevaActividad() {
    this.actividadEditandoId.set(null);
    this.confirmandoEliminarActiId.set(null);
    this.actividadForm.reset({
      codigo: '', fase_id: '',
      nombre_fr: '', nombre_en: '', nombre_es: '',
      activo: true,
    });
    this.actividadFormAbierto.set(true);
  }

  editarActividad(acti: ActividadServicio) {
    this.actividadEditandoId.set(acti.id);
    this.confirmandoEliminarActiId.set(null);
    this.actividadForm.reset({
      codigo:    acti.codigo,
      fase_id:   acti.fase_id ?? '',
      nombre_fr: acti.nombre_fr,
      nombre_en: acti.nombre_en,
      nombre_es: acti.nombre_es,
      activo:    acti.activo,
    });
    this.actividadFormAbierto.set(true);
  }

  cancelarActividad() {
    this.actividadFormAbierto.set(false);
    this.actividadEditandoId.set(null);
  }

  async guardarActividad() {
    if (this.actividadForm.invalid) { this.actividadForm.markAllAsTouched(); return; }
    const s = this.servicio();
    if (!s) return;

    const v = this.actividadForm.getRawValue();
    const payload = {
      servicio_id: s.id,
      fase_id:     v.fase_id ? v.fase_id : null,
      codigo:      v.codigo!.trim(),
      nombre_fr:   v.nombre_fr!.trim(),
      nombre_en:   v.nombre_en!.trim(),
      nombre_es:   v.nombre_es!.trim(),
      activo:      v.activo!,
    };

    this.guardandoActividad.set(true);
    try {
      const editId = this.actividadEditandoId();
      if (editId) {
        const actualizada = await this.actiRepo.actualizar(editId, payload);
        this.actividades.update(list =>
          list.map(x => x.id === editId ? actualizada : x).sort(porCodigo));
        this.toast.show(this.translate.instant('admin_service_types.actividades.success_updated'), 'success');
      } else {
        const creada = await this.actiRepo.crear(payload);
        this.actividades.update(list => [...list, creada].sort(porCodigo));
        this.toast.show(this.translate.instant('admin_service_types.actividades.success_created'), 'success');
      }
      this.actividadFormAbierto.set(false);
      this.actividadEditandoId.set(null);
    } catch (e: unknown) {
      this.toast.show(this.mensajeActividad(e), 'danger');
    } finally {
      this.guardandoActividad.set(false);
    }
  }

  pedirEliminarActividad(acti: ActividadServicio) { this.confirmandoEliminarActiId.set(acti.id); }
  cancelarEliminarActividad()                     { this.confirmandoEliminarActiId.set(null); }

  async confirmarEliminarActividad(acti: ActividadServicio) {
    this.eliminandoActividadId.set(acti.id);
    try {
      await this.actiRepo.eliminar(acti.id);
      this.actividades.update(list => list.filter(x => x.id !== acti.id));
      this.confirmandoEliminarActiId.set(null);
      if (this.actividadEditandoId() === acti.id) this.cancelarActividad();
      this.toast.show(this.translate.instant('admin_service_types.actividades.success_deleted'), 'success');
    } catch (e: unknown) {
      this.toast.show(this.mensajeActividad(e), 'danger');
    } finally {
      this.eliminandoActividadId.set(null);
    }
  }

  // ── Helpers de mensajes de error ───────────────────────────────────────────

  private mensaje(e: unknown, fallbackKey: string): string {
    const m = e instanceof Error ? e.message : '';
    return m || this.translate.instant(fallbackKey);
  }

  /** Traduce las violaciones de unicidad (codigo / orden) a mensajes legibles. */
  private mensajeFase(e: unknown): string {
    const raw = e instanceof Error ? e.message : '';
    const m   = raw.toLowerCase();
    const dup = m.includes('duplicate') || m.includes('unique') || m.includes('23505');
    if (dup && m.includes('orden'))  return this.translate.instant('admin_service_types.fases.err_orden_dup');
    if (dup && m.includes('codigo')) return this.translate.instant('admin_service_types.fases.err_codigo_dup');
    if (dup)                         return this.translate.instant('admin_service_types.fases.err_dup');
    return raw || this.translate.instant('admin_service_types.fases.err_save');
  }

  /** Traduce la violación de unicidad (codigo) de una actividad a un mensaje legible. */
  private mensajeActividad(e: unknown): string {
    const raw = e instanceof Error ? e.message : '';
    const m   = raw.toLowerCase();
    const dup = m.includes('duplicate') || m.includes('unique') || m.includes('23505');
    if (dup) return this.translate.instant('admin_service_types.actividades.err_codigo_dup');
    return raw || this.translate.instant('admin_service_types.actividades.err_save');
  }
}

const porOrden  = (a: FaseServicio, b: FaseServicio) => a.orden - b.orden;
const porCodigo = (a: ActividadServicio, b: ActividadServicio) => a.codigo.localeCompare(b.codigo);
