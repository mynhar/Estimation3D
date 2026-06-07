import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AdminUserService } from '../../../services/admin-user.service';
import { ToastService } from '../../../services/toast.service';

@Component({
  selector: 'app-estimator-client-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './create.component.html',
  styleUrl: './create.component.css',
})
export class EstimatorClientCreateComponent {
  private fb        = inject(FormBuilder);
  private service   = inject(AdminUserService);
  private toast     = inject(ToastService);
  private router    = inject(Router);
  private translate = inject(TranslateService);

  guardando       = signal(false);
  mostrarPassword = signal(false);
  subiendoAvatar  = signal(false);
  previewUrl      = signal<string | null>(null);

  form = this.fb.group({
    email:      ['', [Validators.required, Validators.email]],
    password:   ['', [Validators.required, Validators.minLength(8)]],
    nombre:     ['', Validators.required],
    apellido:   ['', Validators.required],
    telefono:   [''],
    avatar_url: [''],
    activo:     [true, Validators.required],
  });

  get f() { return this.form.controls; }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    try {
      const v = this.form.getRawValue();
      await this.service.crearUsuario({
        email:      v.email!,
        password:   v.password!,
        nombre:     v.nombre!,
        apellido:   v.apellido!,
        telefono:   v.telefono ?? '',
        avatar_url: v.avatar_url ?? '',
        rol:        'cliente',
        activo:     v.activo!,
      });

      this.toast.show(
        this.translate.instant('admin_users.success_created', { nombre: v.nombre, apellido: v.apellido }),
        'success',
      );
      this.router.navigate(['/estimator/client/list']);
    } catch (e: any) {
      this.toast.show(e.message ?? this.translate.instant('admin_users.err_create'), 'danger');
    } finally {
      this.guardando.set(false);
    }
  }

  async onAvatarChange(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    this.previewUrl.set(URL.createObjectURL(file));
    this.subiendoAvatar.set(true);
    try {
      const url = await this.service.uploadAvatar(file);
      this.f['avatar_url'].setValue(url);
    } catch (e: any) {
      this.toast.show(e.message ?? this.translate.instant('admin_users.err_upload_avatar'), 'danger');
      this.previewUrl.set(null);
    } finally {
      this.subiendoAvatar.set(false);
    }
  }

  cancelar(): void {
    this.router.navigate(['/estimator/client/list']);
  }
}
