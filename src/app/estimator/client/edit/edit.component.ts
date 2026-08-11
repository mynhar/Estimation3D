import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AdminUserService } from '../../../services/admin-user.service';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { EdgeErrorService } from '../../../services/edge-error.service';
import { ToastService } from '../../../services/toast.service';
import { DbPerfil } from '../../../types/supabase';

function passwordOpcionalValidator(ctrl: AbstractControl): ValidationErrors | null {
  const v = ctrl.value as string;
  if (v && v.length < 8) return { minlength: true };
  return null;
}

@Component({
  selector: 'app-estimator-client-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, TranslatePipe],
  templateUrl: './edit.component.html',
  styleUrl: './edit.component.css',
})
export class EstimatorClientEditComponent implements OnInit {
  private fb        = inject(FormBuilder);
  private route     = inject(ActivatedRoute);
  private router    = inject(Router);
  private service   = inject(AdminUserService);
  private auth      = inject(AuthSupabaseService);
  private toast     = inject(ToastService);
  private translate = inject(TranslateService);
  private edgeErr   = inject(EdgeErrorService);

  cargando        = signal(true);
  guardando       = signal(false);
  mostrarPassword = signal(false);
  subiendoAvatar  = signal(false);
  previewUrl      = signal<string | null>(null);
  error           = signal<string | null>(null);
  usuario         = signal<DbPerfil | null>(null);

  form = this.fb.group({
    nombre:     ['', Validators.required],
    apellido:   ['', Validators.required],
    telefono:   [''],
    avatar_url: [''],
    activo:     [true, Validators.required],
    email:      [''],
    password:   ['', passwordOpcionalValidator],
  });

  get f() { return this.form.controls; }
  get esProveedorEmail(): boolean { return this.usuario()?.proveedor === 'email'; }

  avatarFallback(): string {
    const u = this.usuario();
    if (!u) return '?';
    return ((u.nombre?.[0] ?? '') + (u.apellido?.[0] ?? '')).toUpperCase() || '?';
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/estimator/client/list']); return; }

    try {
      const { data, error } = await this.auth.client
        .from('perfil')
        .select('*')
        .eq('id', id)
        .eq('rol', 'cliente')
        .single();

      if (error) throw error;
      if (!data) throw new Error(this.translate.instant('admin_users.err_not_found'));

      this.usuario.set(data);
      this.form.patchValue({
        nombre:     data.nombre,
        apellido:   data.apellido,
        telefono:   data.telefono   ?? '',
        avatar_url: data.avatar_url ?? '',
        activo:     data.activo,
        email:      data.email ?? '',
      });

      if (this.esProveedorEmail) {
        this.f['email'].setValidators([Validators.required, Validators.email]);
        this.f['email'].updateValueAndValidity();
      }
    } catch (e: any) {
      this.error.set(e.message ?? this.translate.instant('admin_users.err_load'));
    } finally {
      this.cargando.set(false);
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (!this.usuario())   return;

    this.guardando.set(true);
    try {
      const v = this.form.getRawValue();

      const params: Parameters<AdminUserService['actualizarUsuario']>[1] = {
        nombre:     v.nombre!,
        apellido:   v.apellido!,
        telefono:   v.telefono   ?? '',
        avatar_url: v.avatar_url ?? '',
        rol:        'cliente',
        activo:     v.activo!,
      };

      if (this.esProveedorEmail) {
        if (v.email)    params.email    = v.email;
        if (v.password) params.password = v.password;
      }

      await this.service.actualizarUsuario(this.usuario()!.id, params);
      this.toast.show(
        this.translate.instant('admin_users.success_updated', { nombre: v.nombre, apellido: v.apellido }),
        'success',
      );
      this.router.navigate(['/estimator/client/list']);
    } catch (e: any) {
      this.toast.show(this.edgeErr.mensaje(e, 'admin_users.err_update'), 'danger');
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
      const url = await this.service.uploadAvatar(file, this.usuario()?.id);
      this.f['avatar_url'].setValue(url);
    } catch (e: any) {
      this.toast.show(this.edgeErr.mensaje(e, 'admin_users.err_upload_avatar'), 'danger');
      this.previewUrl.set(null);
    } finally {
      this.subiendoAvatar.set(false);
    }
  }

  cancelar(): void {
    this.router.navigate(['/estimator/client/list']);
  }
}
