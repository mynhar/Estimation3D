import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminUserService } from '../../../services/admin-user.service';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ToastService } from '../../../services/toast.service';
import { DbPerfil, RolUsuario } from '../../../types/supabase';

function passwordOpcionalValidator(ctrl: AbstractControl): ValidationErrors | null {
  const v = ctrl.value as string;
  if (v && v.length < 8) return { minlength: true };
  return null;
}

@Component({
  selector: 'app-admin-user-edit',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './edit.component.html',
  styleUrl: './edit.component.css',
})
export class AdminUserEditComponent implements OnInit {
  private fb      = inject(FormBuilder);
  private route   = inject(ActivatedRoute);
  private router  = inject(Router);
  private service = inject(AdminUserService);
  private auth    = inject(AuthSupabaseService);
  private toast   = inject(ToastService);

  cargando        = true;
  guardando       = false;
  mostrarPassword = false;
  subiendoAvatar  = false;
  previewUrl: string | null = null;
  error: string | null = null;
  usuario: DbPerfil | null = null;

  readonly roles: RolUsuario[] = ['cliente', 'estimador', 'constructor', 'administrador'];

  form = this.fb.group({
    nombre:     ['', Validators.required],
    apellido:   ['', Validators.required],
    telefono:   [''],
    avatar_url: [''],
    rol:        ['cliente' as RolUsuario, Validators.required],
    activo:     [true, Validators.required],
    email:      [''],
    password:   ['', passwordOpcionalValidator],
  });

  get f() { return this.form.controls; }
  get esProveedorEmail(): boolean { return this.usuario?.proveedor === 'email'; }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/admin/user']); return; }

    try {
      const { data, error } = await this.auth.client
        .from('perfil')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data)  throw new Error('Usuario no encontrado');

      this.usuario = data;
      this.form.patchValue({
        nombre:     data.nombre,
        apellido:   data.apellido,
        telefono:   data.telefono   ?? '',
        avatar_url: data.avatar_url ?? '',
        rol:        data.rol,
        activo:     data.activo,
        email:      data.email ?? '',
      });

      // Email requerido solo para proveedor 'email'
      if (this.esProveedorEmail) {
        this.f['email'].setValidators([Validators.required, Validators.email]);
        this.f['email'].updateValueAndValidity();
      }
    } catch (e: any) {
      this.error = e.message ?? 'Error al cargar el usuario';
    } finally {
      this.cargando = false;
    }
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    if (!this.usuario)     return;

    this.guardando = true;
    try {
      const v = this.form.getRawValue();

      const params: Parameters<AdminUserService['actualizarUsuario']>[1] = {
        nombre:     v.nombre!,
        apellido:   v.apellido!,
        telefono:   v.telefono   ?? '',
        avatar_url: v.avatar_url ?? '',
        rol:        v.rol as RolUsuario,
        activo:     v.activo!,
      };

      if (this.esProveedorEmail) {
        if (v.email)    params.email    = v.email;
        if (v.password) params.password = v.password;
      }

      await this.service.actualizarUsuario(this.usuario.id, params);
      this.toast.show(`Usuario ${v.nombre} ${v.apellido} actualizado.`, 'success');
      this.router.navigate(['/admin/user']);
    } catch (e: any) {
      this.toast.show(e.message ?? 'Error al actualizar el usuario.', 'danger');
    } finally {
      this.guardando = false;
    }
  }

  async onAvatarChange(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    this.previewUrl = URL.createObjectURL(file);
    this.subiendoAvatar = true;
    try {
      const url = await this.service.uploadAvatar(file, this.usuario?.id);
      this.f['avatar_url'].setValue(url);
    } catch (e: any) {
      this.toast.show(e.message ?? 'Error al subir la imagen.', 'danger');
      this.previewUrl = null;
    } finally {
      this.subiendoAvatar = false;
    }
  }

  cancelar(): void {
    this.router.navigate(['/admin/user']);
  }
}
