import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PROVINCIAS_CANADA } from '../../../models/servicio.model';
import { AdminUserService, CrearUsuarioParams } from '../../../services/admin-user.service';
import { EdgeErrorService } from '../../../services/edge-error.service';
import { Lang, LangService } from '../../../services/lang.service';
import { ToastService } from '../../../services/toast.service';
import { RolUsuario } from '../../../types/supabase';

@Component({
  selector: 'app-admin-user-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './create.component.html',
  styleUrl: './create.component.css',
})
export class AdminUserCreateComponent {
  private fb        = inject(FormBuilder);
  private service   = inject(AdminUserService);
  private toast     = inject(ToastService);
  private router    = inject(Router);
  private translate = inject(TranslateService);
  private edgeErr   = inject(EdgeErrorService);

  guardando          = signal(false);
  enviandoInvitacion = signal(false);
  mostrarPassword    = signal(false);
  subiendoAvatar     = signal(false);
  previewUrl         = signal<string | null>(null);

  /** Cualquiera de las dos acciones bloquea el formulario mientras corre. */
  ocupado = computed(() => this.guardando() || this.enviandoInvitacion());

  readonly roles: RolUsuario[] = ['cliente', 'estimador', 'constructor', 'administrador'];

  /** fr | en | es, en el orden en que los ofrece el selector de la aplicación. */
  readonly idiomas = inject(LangService).langs;

  readonly provinciasCanada = PROVINCIAS_CANADA;
  /** Código postal canadiense: A1A 1A1 (también acepta «A1A-1A1» y sin separador). */
  private readonly CA_POSTAL_RE = /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/;

  form = this.fb.group({
    email:      ['', [Validators.required, Validators.email]],
    password:   ['', [Validators.required, Validators.minLength(8)]],
    nombre:     ['', Validators.required],
    apellido:   ['', Validators.required],
    telefono:   [''],
    avatar_url: [''],
    rol:        ['cliente' as RolUsuario, Validators.required],
    activo:     [true, Validators.required],
    // Idioma del usuario: en el que se le escribirá (la invitación, y cualquier
    // correo posterior). Arranca en el de la aplicación; el propio usuario lo
    // cambia cuando elige idioma al entrar.
    idioma:     ['fr' as Lang, Validators.required],
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

  /** Idioma en el que se redactará la invitación. */
  idiomaInvitacion = toSignal(this.form.controls.idioma.valueChanges, {
    initialValue: this.form.controls.idioma.value,
  });

  get f() { return this.form.controls; }

  private construirParams(): CrearUsuarioParams {
    const v = this.form.getRawValue();
    return {
      email:      v.email!,
      password:   v.password!,
      nombre:     v.nombre!,
      apellido:   v.apellido!,
      telefono:   v.telefono ?? '',
      avatar_url: v.avatar_url ?? '',
      rol:        v.rol as RolUsuario,
      activo:     v.activo!,
      idioma:     v.idioma as Lang,
      direccion_unidad:        v.direccion_unidad        ?? '',
      direccion_calle:         v.direccion_calle         ?? '',
      direccion_ciudad:        v.direccion_ciudad        ?? '',
      direccion_provincia:     v.direccion_provincia     ?? '',
      direccion_codigo_postal: v.direccion_codigo_postal ?? '',
      // La edge function ignora estos campos si el rol no es constructor.
      ...(this.esConstructor() ? {
        compania_nombre:    v.compania_nombre    ?? '',
        compania_telefono:  v.compania_telefono  ?? '',
        compania_email:     v.compania_email     ?? '',
        compania_direccion: v.compania_direccion ?? '',
      } : {}),
    };
  }

  async onSubmit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.guardando.set(true);
    try {
      const p = this.construirParams();
      await this.service.crearUsuario(p);

      this.toast.show(this.translate.instant('admin_users.success_created', { nombre: p.nombre, apellido: p.apellido }), 'success');
      this.router.navigate(['/admin/user']);
    } catch (e: any) {
      this.toast.show(this.edgeErr.mensaje(e, 'admin_users.err_create'), 'danger');
    } finally {
      this.guardando.set(false);
    }
  }

  /**
   * «Enviar invitación»: crea el usuario igual que «Crear usuario» y además le
   * manda por correo sus credenciales (usuario, contraseña y dirección de la
   * aplicación), redactadas en su idioma.
   *
   * El correo se envía con la contraseña que el administrador acaba de escribir
   * — aquí no hay ninguna que reiniciar, así que no se pide confirmación como
   * en la pantalla de edición.
   *
   * Si el usuario se crea pero el correo falla, el alta se mantiene: se avisa
   * con un toast y el administrador puede reintentar la invitación desde la
   * pantalla de edición.
   */
  async crearEInvitar(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.enviandoInvitacion.set(true);
    try {
      const p = this.construirParams();
      const { id } = await this.service.crearUsuario(p);

      try {
        const envio = await this.service.enviarCredenciales(id, p.password);
        this.toast.show(
          this.translate.instant('admin_users.invite_created_ok', {
            nombre: p.nombre, apellido: p.apellido, email: envio.email,
          }),
          'success',
        );
        // Resend cae en su remitente de pruebas mientras el dominio no esté
        // verificado, y ese sólo entrega al dueño de la cuenta: el usuario no
        // recibe nada y hay que avisarlo.
        if (envio.remitente.endsWith('resend.dev')) {
          this.toast.show(
            this.translate.instant('admin_users.invite_fallback_from', { remitente: envio.remitente }),
            'warning',
          );
        }
      } catch (e: any) {
        this.toast.show(
          this.translate.instant('admin_users.invite_created_mail_failed', {
            nombre: p.nombre, apellido: p.apellido,
            motivo: this.edgeErr.mensaje(e, 'admin_users.err_invite'),
          }),
          'warning',
        );
      }

      this.router.navigate(['/admin/user']);
    } catch (e: any) {
      this.toast.show(this.edgeErr.mensaje(e, 'admin_users.err_create'), 'danger');
    } finally {
      this.enviandoInvitacion.set(false);
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
      this.toast.show(this.edgeErr.mensaje(e, 'admin_users.err_upload_avatar'), 'danger');
      this.previewUrl.set(null);
    } finally {
      this.subiendoAvatar.set(false);
    }
  }

  cancelar(): void {
    this.router.navigate(['/admin/user']);
  }
}
