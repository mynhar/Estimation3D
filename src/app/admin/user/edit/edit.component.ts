import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators, AbstractControl, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { PROVINCIAS_CANADA, SERVICIOS_FALLBACK, Servicio } from '../../../models/servicio.model';
import { AdminUserService, EnvioCredenciales } from '../../../services/admin-user.service';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { EdgeErrorService } from '../../../services/edge-error.service';
import { LangService } from '../../../services/lang.service';
import { ToastService } from '../../../services/toast.service';
import { DbPerfil, RolUsuario } from '../../../types/supabase';
import { especialidadesRequeridas } from '../../../shared/validators/especialidades.validator';

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
  /** Licencia RBQ de Quebec: diez digitos en tres bloques, 0000-0000-00. */
  private readonly RBQ_RE = /^\d{4}-\d{4}-\d{2}$/;

  /** Tipos de servicio activos: de ahi salen las especialidades del constructor. */
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
    nombre:     ['', Validators.required],
    apellido:   ['', Validators.required],
    telefono:   ['', Validators.required],
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
    // Seccion Perfil profesional: los validadores se activan y se retiran segun
    // el rol (ver `sincronizarValidadoresConstructor`), porque estos campos son
    // obligatorios para el constructor e inexistentes para los demas roles.
    rbq:               [''],
    // «Todos los servicios» es una respuesta por derecho propio, no la ausencia
    // de respuesta: viaja en su propio campo y no como una lista vacia. Las dos
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

  /** Campos de Perfil profesional obligatorios para el constructor. */
  private readonly CAMPOS_CONSTRUCTOR = [
    'rbq', 'anios_experiencia', 'zona_servicio',
  ] as const;

  constructor() {
    // El rol se puede cambiar aqui mismo: los validadores del bloque Perfil
    // profesional tienen que seguirlo, o el formulario quedaria invalido por
    // campos que ya no estan en pantalla.
    effect(() => this.sincronizarValidadoresConstructor(this.esConstructor()));
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
    // Las especialidades no estan en `CAMPOS_CONSTRUCTOR` porque su validador no
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
  // que cubre esa respuesta.

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
   * Especialidades ya registradas. La lista completa vive en
   * `perfil_especialidad`; los perfiles anteriores a esa tabla solo tienen la
   * columna escalar `especialidad_id`, y de ahi sale entonces la unica marca.
   *
   * Se descartan los ids que no esten en el catalogo activo: no se pueden
   * mostrar, y reenviarlos al guardar haria fallar la edge function.
   */
  private async cargarEspecialidades(perfil: DbPerfil): Promise<void> {
    if (perfil.rol !== 'constructor') return;

    this.form.controls.especialidad_todas.setValue(perfil.especialidad_todas === true, { emitEvent: false });
    if (perfil.especialidad_todas) return;

    const { data, error } = await this.auth.client
      .from('perfil_especialidad')
      .select('servicio_id')
      .eq('perfil_id', perfil.id);
    if (error) console.error('[AdminUserEdit] especialidades:', error.message);

    const activos  = new Set(this.servicios().map(s => s.id));
    const listados = (data ?? []).map(r => Number(r.servicio_id));
    const guardados = listados.length ? listados
                    : perfil.especialidad_id != null ? [perfil.especialidad_id]
                    : [];

    this.form.controls.especialidad_ids.setValue(
      guardados.filter(id => activos.has(id)), { emitEvent: false },
    );
  }

  private async cargarServicios(): Promise<void> {
    this.cargandoServicios.set(true);
    const { data, error } = await this.auth.client
      .from('servicio')
      .select('id, codigo, nombre_fr, nombre_en, nombre_es')
      .eq('activo', true)
      .order('codigo');
    if (error) console.error('[AdminUserEdit] servicios:', error.message);
    this.servicios.set(data?.length ? (data as unknown as Servicio[]) : SERVICIOS_FALLBACK);
    this.cargandoServicios.set(false);
  }

  /**
   * Va dando forma 0000-0000-00 mientras se escribe: se queda con los digitos y
   * coloca los guiones. Asi el campo no puede salir con un formato que el CHECK
   * de la base rechazaria despues.
   */
  formatearRbq(event: Event): void {
    const input = event.target as HTMLInputElement;
    const d = input.value.replace(/\D/g, '').slice(0, 10);
    const partes = [d.slice(0, 4), d.slice(4, 8), d.slice(8, 10)].filter(x => x !== '');
    const valor = partes.join('-');
    input.value = valor;
    this.form.controls.rbq.setValue(valor);
  }

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

    await this.cargarServicios();

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
        rbq:               data.rbq ?? '',
        anios_experiencia: data.anios_experiencia ?? null,
        zona_servicio:     data.zona_servicio ?? '',
        mensaje:           data.mensaje ?? '',
      });

      // Despues del patch, porque `cargarEspecialidades` mira el rol ya cargado.
      await this.cargarEspecialidades(data);

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
        params.rbq                = v.rbq ?? '';
        // «Todos los servicios» tiene columna propia: no se guarda como lista
        // vacia. El `especialidad_id` escalar lo deriva la edge function.
        params.especialidad_todas = v.especialidad_todas === true;
        params.especialidad_ids   = v.especialidad_todas === true ? [] : (v.especialidad_ids ?? []);
        params.anios_experiencia  = v.anios_experiencia != null ? Number(v.anios_experiencia) : null;
        params.zona_servicio      = v.zona_servicio ?? '';
        params.mensaje            = v.mensaje ?? '';
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
