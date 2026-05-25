import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ToastService } from '../../../services/toast.service';

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

  cargando  = signal(true);
  guardando = signal(false);
  error     = signal<string | null>(null);
  servicio  = signal<Servicio | null>(null);

  form = this.fb.group({
    nombre_fr:      ['', Validators.required],
    nombre_en:      ['', Validators.required],
    nombre_es:      ['', Validators.required],
    descripcion_fr: [''],
    descripcion_en: [''],
    descripcion_es: [''],
    activo:         [true],
  });

  get f() { return this.form.controls; }

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
    } catch (e: any) {
      this.error.set(e.message ?? this.translate.instant('admin_service_types.err_load'));
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
    } catch (e: any) {
      this.toast.show(
        e.message ?? this.translate.instant('admin_service_types.err_update'),
        'danger',
      );
    } finally {
      this.guardando.set(false);
    }
  }

  cancelar() {
    this.router.navigate(['/admin/service-type']);
  }
}
