import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PROVINCIAS_CANADA, SERVICIOS_FALLBACK, Servicio } from '../../../models/servicio.model';
import { AdminUserService, CrearUsuarioParams } from '../../../services/admin-user.service';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { EdgeErrorService } from '../../../services/edge-error.service';
import { Lang, LangService } from '../../../services/lang.service';
import { ToastService } from '../../../services/toast.service';
import { RolUsuario } from '../../../types/supabase';
import { especialidadesRequeridas } from '../../../shared/validators/especialidades.validator';

@Component({
  selector: 'app-admin-user-create',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe],
  templateUrl: './create.component.html',
  styleUrl: './create.component.css',
})
export class AdminUserCreateComponent implements OnInit {
  private fb        = inject(FormBuilder);
  private auth      = inject(AuthSupabaseService);
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
  /** Licencia RBQ de Quebec: diez dígitos en tres bloques, «0000-0000-00». */
  private readonly RBQ_RE = /^\d{4}-\d{4}-\d{2}$/;

  /** Tipos de servicio activos: las especialidades del constructor salen de aquí. */
  readonly servicios = signal<Servicio[]>([]);
  readonly cargandoServicios = signal(false);
  private readonly lang = inject(LangService);

  /** Los servicios con el nombre ya resuelto al idioma en curso. */
  readonly especialidades = computed(() => {
    const l = this.lang.current();
    return this.servicios().map(s => ({
      id: s.id,
      nombre: l === 'en' ? (s.nombre_en || s.nombre_fr)
            : l === 'es' ? (s.nombre_es || s.nombre_fr)
            :              (s.nombre_fr || s.nombre_es),
    }));
  });

  form = this.fb.group({
    email:      ['', [Validators.required, Validators.email]],
    password:   ['', [Validators.required, Validators.minLength(8)]],
    nombre:     ['', Validators.required],
    apellido:   ['', Validators.required],
    telefono:   ['', Validators.required],
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
    // Sección Constructor: los validadores se activan y se retiran según el rol
    // (ver `sincronizarValidadoresConstructor`), porque estos campos son
    // obligatorios para el constructor e inexistentes para el resto de roles.
    rbq:               [''],
    // «Todos los servicios» es una respuesta por derecho propio, no la ausencia
    // de respuesta: viaja en su propio campo y no como una lista vacía. Las dos
    // son excluyentes, y para el constructor una de las dos es obligatoria.
    especialidad_todas: [false],
    especialidad_ids:   this.fb.nonNullable.control<number[]>([], especialidadesRequeridas),
    anios_experiencia: [null as number | null],
    zona_servicio:     [''],
    mensaje:           [''],
  });

  /** El rol elegido, como signal, para mostrar/ocultar la sección Compañía. */
  rolSeleccionado = toSignal(this.form.controls.rol.valueChanges, {
    initialValue: this.form.controls.rol.value,
  });
  esConstructor = computed(() => this.rolSeleccionado() === 'constructor');

  /** Campos de la sección Constructor que son obligatorios para ese rol. */
  private readonly CAMPOS_CONSTRUCTOR = [
    'rbq', 'anios_experiencia', 'zona_servicio',
  ] as const;

  constructor() {
    // El rol se puede cambiar en cualquier momento: los validadores del bloque
    // Constructor tienen que seguirlo, o el formulario quedaría inválido por
    // campos que ya no están en pantalla.
    effect(() => this.sincronizarValidadoresConstructor(this.esConstructor()));
  }

  async ngOnInit(): Promise<void> {
    await this.cargarServicios();
  }

  private async cargarServicios(): Promise<void> {
    this.cargandoServicios.set(true);
    const { data, error } = await this.auth.client
      .from('servicio')
      .select('id, codigo, nombre_fr, nombre_en, nombre_es')
      .eq('activo', true)
      .order('codigo');
    if (error) console.error('[AdminUserCreate] servicios:', error.message);
    this.servicios.set(data?.length ? (data as unknown as Servicio[]) : SERVICIOS_FALLBACK);
    this.cargandoServicios.set(false);
  }

  private sincronizarValidadoresConstructor(activo: boolean): void {
    for (const campo of this.CAMPOS_CONSTRUCTOR) {
      const ctrl = this.form.get(campo)!;
      if (activo) {
        const extra = campo === 'rbq'
          ? [Validators.pattern(this.RBQ_RE)]
          : campo === 'anios_experiencia'
          ? [Validators.min(0), Validators.max(80)]
          : [];
        ctrl.setValidators([Validators.required, ...extra]);
      } else {
        ctrl.clearValidators();
        ctrl.reset(campo === 'anios_experiencia' ? null : '', { emitEvent: false });
      }
      ctrl.updateValueAndValidity({ emitEvent: false });
    }
    // Las especialidades no están en `CAMPOS_CONSTRUCTOR` porque su validador no
    // es `required` a secas: se pone y se quita entero.
    const esp = this.form.controls.especialidad_ids;
    esp.setValidators(activo ? [especialidadesRequeridas] : []);
    esp.updateValueAndValidity({ emitEvent: false });

    if (!activo) {
      this.form.controls.especialidad_todas.reset(false, { emitEvent: false });
      esp.reset([], { emitEvent: false });
      this.form.controls.mensaje.reset('', { emitEvent: false });
    }
  }

  // ── Especialidades ────────────────────────────────────────────────────────
  //
  // «Todos los servicios» y las casillas sueltas son excluyentes: al marcarlo,
  // las de abajo quedan inertes en vez de desaparecer, para que se siga viendo
  // qué cubre esa respuesta.

  get todosLosServicios(): boolean {
    return this.form.controls.especialidad_todas.value === true;
  }

  tieneEspecialidad(id: number): boolean {
    return this.form.controls.especialidad_ids.value.includes(id);
  }

  alternarTodosLosServicios(marcado: boolean): void {
    this.form.controls.especialidad_todas.setValue(marcado);
    const esp = this.form.controls.especialidad_ids;
    if (marcado) esp.setValue([]);
    esp.updateValueAndValidity();
    esp.markAsTouched();
  }

  alternarEspecialidad(id: number, marcado: boolean): void {
    const esp = this.form.controls.especialidad_ids;
    const lista = esp.value;
    esp.setValue(marcado ? [...lista, id] : lista.filter(v => v !== id));
    esp.markAsTouched();
  }

  /**
   * Va dando forma «0000-0000-00» mientras se escribe: se queda con los dígitos
   * y coloca los guiones. Así el campo no puede salir con un formato que el
   * CHECK de la base rechazaría después.
   */
  formatearRbq(event: Event): void {
    const input = event.target as HTMLInputElement;
    const d = input.value.replace(/\D/g, '').slice(0, 10);
    const partes = [d.slice(0, 4), d.slice(4, 8), d.slice(8, 10)].filter(p => p !== '');
    const valor = partes.join('-');
    input.value = valor;
    this.form.controls.rbq.setValue(valor);
  }

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
        rbq:                v.rbq ?? '',
        // «Todos los servicios» tiene columna propia: no se guarda como lista
        // vacía. El `especialidad_id` escalar lo deriva la edge function.
        especialidad_todas: v.especialidad_todas === true,
        especialidad_ids:   v.especialidad_todas === true ? [] : (v.especialidad_ids ?? []),
        anios_experiencia:  v.anios_experiencia != null ? Number(v.anios_experiencia) : null,
        zona_servicio:      v.zona_servicio ?? '',
        mensaje:            v.mensaje       ?? '',
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
