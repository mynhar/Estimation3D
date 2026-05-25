import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-admin-service-type-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './create.component.html',
  styleUrl:    './create.component.css',
})
export class AdminServiceTypeCreateComponent {
  private fb        = inject(FormBuilder);
  private router    = inject(Router);
  private auth      = inject(AuthSupabaseService);
  private toast     = inject(ToastService);
  private translate = inject(TranslateService);

  guardando = signal(false);

  form = this.fb.group({
    codigo:         ['', [Validators.required, Validators.pattern(/^[a-z_]+$/)]],
    nombre_fr:      ['', Validators.required],
    nombre_en:      ['', Validators.required],
    nombre_es:      ['', Validators.required],
    descripcion_fr: ['', Validators.required],
    descripcion_en: ['', Validators.required],
    descripcion_es: ['', Validators.required],
    activo:         [true],
  });

  get f() { return this.form.controls; }

  async onSubmit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    this.guardando.set(true);
    try {
      const v = this.form.getRawValue();
      const { error } = await this.auth.client
        .from('servicio')
        .insert({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          codigo:         v.codigo! as any,
          nombre_fr:      v.nombre_fr!,
          nombre_en:      v.nombre_en!,
          nombre_es:      v.nombre_es!,
          descripcion_fr: v.descripcion_fr!,
          descripcion_en: v.descripcion_en!,
          descripcion_es: v.descripcion_es!,
          activo:         v.activo!,
        });

      if (error) throw error;

      this.toast.show(
        this.translate.instant('admin_service_types.success_created'),
        'success',
      );
      this.router.navigate(['/admin/service-type']);
    } catch (e: any) {
      this.toast.show(
        e.message ?? this.translate.instant('admin_service_types.err_create'),
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
