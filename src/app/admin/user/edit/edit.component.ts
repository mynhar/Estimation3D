import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PROVINCIAS_CANADA } from '../../../models/servicio.model';
import { AdminUserService, EnvioCredenciales } from '../../../services/admin-user.service';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { EdgeErrorService } from '../../../services/edge-error.service';
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
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, ReactiveFormsModule, TranslatePipe],
  templateUrl: './edit.component.html',
  styleUrl: './edit.component.css',
})
export class AdminUserEditComponent implements OnInit {
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

  // Invitación por correo
  confirmarInvitacion = signal(false);
  enviandoInvitacion  = signal(false);
  envio               = signal<EnvioCredenciales | null>(null);

  /** Idioma registrado del usuario; es en el que se redactará el correo. */
  idiomaUsuario = computed<'fr' | 'en' | 'es'>(() => {
    const v = this.usuario()?.idioma;
    return v === 'en' || v === 'es' ? v : 'fr';
  });

  /**
   * Resend rechaza el remitente propio mientras el dominio no esté verificado y
   * la función cae en su remitente de pruebas, que sólo entrega al dueño de la
   * cuenta: el usuario no recibe nada y hay que avisarlo.
   */
  envioConFallback = computed(() => this.envio()?.remitente.endsWith('resend.dev') ?? false);

  readonly roles: RolUsuario[] = ['cliente', 'estimador', 'constructor', 'administrador'];

  readonly provinciasCanada = PROVINCIAS_CANADA;
  /** Código postal canadiense: A1A 1A1 (también acepta «A1A-1A1» y sin separador). */
  private readonly CA_POSTAL_RE = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

  form = this.fb.group({
    nombre:     ['', Validators.required],
    apellido:   ['', Validators.required],
    telefono:   [''],
    avatar_url: [''],
    rol:        ['cliente' as RolUsuario, Validators.required],
    activo:     [true, Validators.required],
    email:      [''],
    password:   ['', passwordOpcionalValidator],
    // Dirección personal (canadiense): los cinco campos son opcionales. El
    // código postal sólo se valida si se escribe algo — `Validators.pattern`
    // deja pasar la cadena vacía.
    direccion_unidad:        [''],
    direccion_calle:         [''],
    direccion_ciudad:        [''],
    direccion_provincia:     [''],
    direccion_codigo_postal: ['', Validators.pattern(this.CA_POSTAL_RE)],
    // Sección Compañía: sólo para el constructor, todos opcionales.
    compania_nombre:    [''],
    compania_telefono:  [''],
    compania_email:     ['', Validators.email],
    compania_direccion: [''],
  });

  /** El rol elegido, como signal, para mostrar/ocultar la sección Compañía. */
  rolSeleccionado = toSignal(this.form.controls.rol.valueChanges, {
    initialValue: this.form.controls.rol.value,
  });
  esConstructor = computed(() => this.rolSeleccionado() === 'constructor');

  get f() { return this.form.controls; }
  get esProveedorEmail(): boolean { return this.usuario()?.proveedor === 'email'; }

  avatarFallback(): string {
    const u = this.usuario();
    if (!u) return '?';
    return ((u.nombre?.[0] ?? '') + (u.apellido?.[0] ?? '')).toUpperCase() || '?';
  }

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
      if (!data)  throw new Error(this.translate.instant('admin_users.err_not_found'));

      this.usuario.set(data);
      this.form.patchValue({
        nombre:     data.nombre,
        apellido:   data.apellido,
        telefono:   data.telefono   ?? '',
        avatar_url: data.avatar_url ?? '',
        rol:        data.rol,
        activo:     data.activo,
        email:      data.email ?? '',
        direccion_unidad:        data.direccion_unidad        ?? '',
        direccion_calle:         data.direccion_calle         ?? '',
        direccion_ciudad:        data.direccion_ciudad        ?? '',
        direccion_provincia:     data.direccion_provincia     ?? '',
        direccion_codigo_postal: data.direccion_codigo_postal ?? '',
        compania_nombre:    data.compania_nombre    ?? '',
        compania_telefono:  data.compania_telefono  ?? '',
        compania_email:     data.compania_email     ?? '',
        compania_direccion: data.compania_direccion ?? '',
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
        rol:        v.rol as RolUsuario,
        activo:     v.activo!,
        direccion_unidad:        v.direccion_unidad        ?? '',
        direccion_calle:         v.direccion_calle         ?? '',
        direccion_ciudad:        v.direccion_ciudad        ?? '',
        direccion_provincia:     v.direccion_provincia     ?? '',
        direccion_codigo_postal: v.direccion_codigo_postal ?? '',
      };

      if (this.esProveedorEmail) {
        if (v.email)    params.email    = v.email;
        if (v.password) params.password = v.password;
      }

      // La edge function los ignora (y limpia) si el rol no es constructor.
      if (this.esConstructor()) {
        params.compania_nombre    = v.compania_nombre    ?? '';
        params.compania_telefono  = v.compania_telefono  ?? '';
        params.compania_email     = v.compania_email     ?? '';
        params.compania_direccion = v.compania_direccion ?? '';
      }

      await this.service.actualizarUsuario(this.usuario()!.id, params);
      this.toast.show(this.translate.instant('admin_users.success_updated', { nombre: v.nombre, apellido: v.apellido }), 'success');
      this.router.navigate(['/admin/user']);
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

  // ── Invitación por correo ─────────────────────────────────────────────────
  //
  // La contraseña guardada no se puede leer (está hasheada), así que enviarla
  // implica fijar una nueva. Nunca se genera: la escribe el administrador en
  // «Nueva contraseña», y es obligatoria para invitar. Por eso hay confirmación.

  /** Contraseña escrita por el administrador, si la hay. */
  get passwordEscrita(): string {
    return (this.f['password'].value ?? '').trim();
  }

  abrirInvitacion(): void {
    if (this.f['password'].invalid) { this.f['password'].markAsTouched(); return; }
    // En esta pantalla la contraseña es opcional para guardar, pero obligatoria
    // para invitar: es la que va en el correo.
    if (!this.passwordEscrita) {
      this.f['password'].setErrors({ required: true });
      this.f['password'].markAsTouched();
      return;
    }
    this.envio.set(null);
    this.confirmarInvitacion.set(true);
  }

  async enviarInvitacion(): Promise<void> {
    const u = this.usuario();
    if (!u) return;

    const escrita = this.passwordEscrita;
    if (!escrita) { this.confirmarInvitacion.set(false); return; }

    this.enviandoInvitacion.set(true);
    try {
      const resultado = await this.service.enviarCredenciales(u.id, escrita);
      this.envio.set(resultado);
      this.confirmarInvitacion.set(false);
      this.toast.show(
        this.translate.instant('admin_users.invite_ok', { email: resultado.email }),
        'success',
      );
    } catch (e: any) {
      this.toast.show(this.edgeErr.mensaje(e, 'admin_users.err_invite'), 'danger');
    } finally {
      this.enviandoInvitacion.set(false);
    }
  }

  cancelar(): void {
    this.router.navigate(['/admin/user']);
  }
}
