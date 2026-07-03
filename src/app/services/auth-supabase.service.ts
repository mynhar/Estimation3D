import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { createClient, SupabaseClient, User, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { Subject, firstValueFrom, filter, take, timeout, catchError, of } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';
import { Database, RolUsuario, TablesUpdate } from '../types/supabase';

export type PerfilCache = {
  nombre:     string;
  apellido:   string;
  avatar_url: string | null;
};

@Injectable({
  providedIn: 'root',
})
export class AuthSupabaseService {
  private supabase: SupabaseClient<Database>;
  private router = inject(Router);
  private translate = inject(TranslateService);

  // Signals — fuente de verdad del estado de autenticación
  private userSig        = signal<User | null>(null);
  private initializedSig = signal<boolean>(false);
  private rolSig         = signal<RolUsuario | null | undefined>(undefined);
  private perfilCacheSig = signal<PerfilCache | null>(null);

  // Caché de rol y perfil — evita re-queries en cada navegación guardada
  private lastUserId: string | null = null;
  private perfilChannel: RealtimeChannel | null = null;

  // Subjects para eventos puntuales (no son estado, no tienen valor inicial)
  private perfilEditadoSubject     = new Subject<{ nombre: string; apellido: string }>();
  private avatarActualizadoSubject = new Subject<string>();

  // Observables públicos derivados de signals (compatibilidad con guards y componentes)
  user$        = toObservable(this.userSig);
  initialized$ = toObservable(this.initializedSig);
  rol$         = toObservable(this.rolSig);
  perfilCache$ = toObservable(this.perfilCacheSig);

  perfilEditado$     = this.perfilEditadoSubject.asObservable();
  avatarActualizado$ = this.avatarActualizadoSubject.asObservable();

  notificarEdicionPerfil(nombre: string, apellido: string): void {
    this.perfilEditadoSubject.next({ nombre, apellido });
    const current = this.perfilCacheSig();
    if (current) this.perfilCacheSig.set({ ...current, nombre, apellido });
  }

  notificarEdicionAvatar(url: string): void {
    this.avatarActualizadoSubject.next(url);
    const current = this.perfilCacheSig();
    if (current) this.perfilCacheSig.set({ ...current, avatar_url: url || null });
  }

  get client(): SupabaseClient<Database> { return this.supabase; }

  constructor() {
    // Serializa las operaciones de auth (incl. el refresh de token) dentro de
    // esta pestaña con una cola de promesas, en lugar de los Navigator Locks.
    // Evita a la vez el NavigatorLockAcquireTimeoutError y las carreras de
    // refresh concurrente que consumían/rotaban el refresh token (lo que
    // revocaba la sesión → "Refresh Token Not Found").
    let lockChain: Promise<unknown> = Promise.resolve();

    this.supabase = createClient<Database>(
      environment.supabase.url,
      environment.supabase.anonKey,
      {
        auth: {
          lock: <R>(_name: string, _timeout: number, fn: () => Promise<R>): Promise<R> => {
            const run = lockChain.then(fn, fn);
            lockChain = run.then(() => undefined, () => undefined);
            return run;
          },
        },
      }
    );

    this.supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      this.userSig.set(user);

      if (!this.initializedSig()) {
        this.initializedSig.set(true);
      }

      if (user) {
        // Solo re-carga si cambia el usuario (evita re-queries en TOKEN_REFRESHED, etc.)
        if (user.id !== this.lastUserId) {
          this.lastUserId = user.id;
          this.rolSig.set(undefined); // señal de "cargando"
          this.cargarPerfilCache(user.id);
          this.suscribirCambiosPerfil(user.id);
        }

        // Google OAuth: sincronizar perfil y redirigir solo desde login/landing
        if (event === 'SIGNED_IN' && user.app_metadata?.['provider'] === 'google') {
          this.syncGoogleProfile(user);
          const url = this.router.url;
          const esRutaPublica = url === '/' || url === '/login' || url.startsWith('/?') || url.startsWith('/login?');
          if (esRutaPublica) {
            this.getHomeRoute().then(route => this.router.navigate([route]));
          }
        }
      } else {
        this.lastUserId = null;
        this.rolSig.set(null);
        this.perfilCacheSig.set(null);
        this.cancelarSuscripcionPerfil();
      }
    });
  }

  // ----------------------------------------------------------
  // Carga y cachea rol + perfil desde la tabla perfil
  // ----------------------------------------------------------
  private async cargarPerfilCache(userId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('perfil')
      .select('rol, nombre, apellido, avatar_url')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.message?.includes('infinite recursion')) {
        console.error('[Auth] RLS recursivo en tabla perfil.');
      } else {
        console.error('[Auth] cargarPerfilCache error:', error.message);
      }
      this.rolSig.set(null);
      return;
    }

    this.rolSig.set(data?.rol ?? null);
    this.perfilCacheSig.set({
      nombre:     data?.nombre     ?? '',
      apellido:   data?.apellido   ?? '',
      avatar_url: data?.avatar_url ?? null,
    });
  }

  // ----------------------------------------------------------
  // Login con email y contraseña
  // ----------------------------------------------------------
  async signInWithEmail(email: string, password: string): Promise<void> {
    const { data, error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    if (data.user) {
      const { data: perfil } = await this.supabase
        .from('perfil')
        .select('activo')
        .eq('id', data.user.id)
        .single();

      if (perfil?.activo === false) {
        await this.supabase.auth.signOut();
        throw new Error('account_inactive');
      }
    }
  }

  // ----------------------------------------------------------
  // Login / Registro con Google OAuth
  // ----------------------------------------------------------
  async signInWithGoogle(): Promise<void> {
    const { error } = await this.supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    });
    if (error) throw error;
  }

  // ----------------------------------------------------------
  // Registro con email y contraseña
  //
  // FIX 1: pasar perfil en options.data para que el trigger
  //        on_auth_user_created lo lea de raw_user_meta_data
  //        y cree el perfil completo automáticamente.
  // ----------------------------------------------------------
  async signUp(
    email: string,
    password: string,
    perfil: { nombre: string; apellido: string; telefono: string; rol?: RolUsuario }
  ): Promise<void> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          nombre:   perfil.nombre,
          apellido: perfil.apellido,
          telefono: perfil.telefono,
          rol:      perfil.rol ?? 'cliente',
          activo:   perfil.rol === 'constructor' ? false : true,
        },
      },
    });

    if (error) throw error;

    if (data.user) {
      await this.savePerfilEmailFallback(data.user.id, perfil);
    }
  }

  // ----------------------------------------------------------
  // Fallback: solo se ejecuta si el trigger falló.
  // Intenta actualizar primero (trigger ya creó la fila),
  // y si no existe la fila, la inserta.
  //
  // FIX 2: columna 'id', no 'user_id'
  // ----------------------------------------------------------
  private async savePerfilEmailFallback(
    userId: string,
    perfil: { nombre: string; apellido: string; telefono: string; rol?: RolUsuario }
  ): Promise<void> {
    const rolDeseado = (perfil.rol ?? 'cliente') as RolUsuario;

    const activoDeseado = rolDeseado !== 'constructor';

    const { data: existente } = await this.supabase
      .from('perfil')
      .select('id, perfil_completo, rol, activo')
      .eq('id', userId)
      .single();

    // El trigger creó el perfil con rol y activo correctos — no hacer nada
    if (
      existente?.perfil_completo === true &&
      existente?.rol === rolDeseado &&
      existente?.activo === activoDeseado
    ) return;

    const campos: TablesUpdate<'perfil'> = {
      nombre:           perfil.nombre,
      apellido:         perfil.apellido,
      telefono:         perfil.telefono,
      rol:              rolDeseado,
      activo:           activoDeseado,
      perfil_completo:  true,
    };

    if (existente) {
      // El trigger creó la fila pero sin datos — actualizar
      const { error } = await this.supabase
        .from('perfil')
        .update(campos)
        .eq('id', userId);          // ← FIX 2: 'id' no 'user_id'
      if (error) throw error;
    } else {
      // El trigger no creó la fila — insertar
      const { error } = await this.supabase
        .from('perfil')
        .insert({ id: userId, ...campos });
      if (error) throw error;
    }
  }

  // ----------------------------------------------------------
  // Ruta de inicio según rol del usuario
  // ----------------------------------------------------------
  async getHomeRoute(): Promise<string> {
    const rol = await firstValueFrom(
      this.rol$.pipe(
        filter((r): r is RolUsuario | null => r !== undefined),
        take(1),
        timeout(8_000),
        catchError(() => of(null)),
      )
    );
    if (rol === 'administrador') return '/admin/dashboard';
    if (rol === 'constructor')   return '/builder/dashboard';
    if (rol === 'estimador')     return '/estimator/dashboard';
    return '/client/dashboard';
  }

  // ----------------------------------------------------------
  // Access token válido para llamadas manuales a Edge Functions.
  // getSession() devuelve el token almacenado, que puede estar caducado
  // (los JWT duran ~1h); el fetch() manual no pasa por el auto-refresh de
  // supabase-js, así que lo refrescamos aquí si está por caducar.
  // ----------------------------------------------------------
  async getAccessToken(): Promise<string> {
    const { data } = await this.supabase.auth.getSession();
    const session = data.session;
    const expiraEnMs = session?.expires_at ? session.expires_at * 1000 - Date.now() : -1;

    // Token vigente (con 60s de margen): úsalo tal cual.
    if (session?.access_token && expiraEnMs > 60_000) {
      return session.access_token;
    }

    // Caducado o ausente: intentar refrescar.
    const { data: refreshed, error } = await this.supabase.auth.refreshSession();
    const nuevo = refreshed.session?.access_token;
    if (!error && nuevo) return nuevo;

    // La sesión está muerta (refresh token inválido / sesión revocada, p. ej. por
    // "single session per user"). Limpiar y mandar a login para re-autenticar.
    await this.forzarReautenticacion();
    throw new Error(this.translate.instant('auth.session_expired'));
  }

  private async forzarReautenticacion(): Promise<void> {
    try { await this.supabase.auth.signOut(); } catch { /* noop */ }
    this.router.navigate(['/login'], { queryParams: { expired: '1' } });
  }

  // ----------------------------------------------------------
  // Cerrar sesión
  // ----------------------------------------------------------
  async signOut(): Promise<void> {
    await this.supabase.auth.signOut();
    this.router.navigate(['/login']);
  }

  // ----------------------------------------------------------
  // Sincronizar perfil de Google
  // Llama al SIGNED_IN de onAuthStateChange cuando provider=google.
  //
  // FIX 2: columna 'id', no 'user_id'
  // ----------------------------------------------------------
  private async syncGoogleProfile(user: User): Promise<void> {
    const fullName: string = user.user_metadata?.['full_name'] ?? '';
    const { nombre, apellido } = this.parseFullName(fullName);
    const avatarUrl: string = user.user_metadata?.['avatar_url'] ?? '';

    // Verificar si el perfil ya está completo (re-login)
    const { data: existente } = await this.supabase
      .from('perfil')
      .select('id, perfil_completo')
      .eq('id', user.id)            // ← FIX 2: 'id' no 'user_id'
      .single();

    if (existente?.perfil_completo === true) return; // ya está completo

    const campos: TablesUpdate<'perfil'> = {
      avatar_url:      avatarUrl || null,
      perfil_completo: true,
    };

    // Solo actualizar nombre/apellido si Google los proveyó
    if (nombre)   campos['nombre']   = nombre;
    if (apellido) campos['apellido'] = apellido;

    if (existente) {
      // Trigger creó la fila — actualizar con datos de Google
      await this.supabase
        .from('perfil')
        .update(campos)
        .eq('id', user.id);         // ← FIX 2: 'id' no 'user_id'
    } else {
      // Trigger no creó la fila — insertar
      await this.supabase
        .from('perfil')
        .insert({
          id:        user.id,
          proveedor: 'google',
          rol:       'cliente',
          ...campos,
        });
    }
  }

  // ----------------------------------------------------------
  // Realtime: re-carga el caché cuando el perfil cambia en otra
  // pestaña o por acción del administrador.
  // Requiere que la tabla `perfil` tenga Realtime habilitado en Supabase.
  // ----------------------------------------------------------
  private suscribirCambiosPerfil(userId: string): void {
    this.cancelarSuscripcionPerfil();

    this.perfilChannel = this.supabase
      .channel(`perfil-own-${userId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'perfil', filter: `id=eq.${userId}` },
        () => this.cargarPerfilCache(userId)
      )
      .subscribe();
  }

  private cancelarSuscripcionPerfil(): void {
    if (this.perfilChannel) {
      this.supabase.removeChannel(this.perfilChannel);
      this.perfilChannel = null;
    }
  }

  // ----------------------------------------------------------
  // Parsear nombre completo de Google en nombre + apellido
  // Ejemplo: "Jean Marc Tremblay" → { nombre: "Jean", apellido: "Marc Tremblay" }
  // ----------------------------------------------------------
  private parseFullName(fullName: string): { nombre: string; apellido: string } {
    const words = fullName.trim().split(/\s+/).filter(Boolean);

    if (words.length === 0) return { nombre: '', apellido: '' };
    if (words.length === 1) return { nombre: words[0], apellido: '' };
    if (words.length === 2) return { nombre: words[0], apellido: words[1] };

    // 3+ palabras: primera palabra = nombre, el resto = apellido
    return {
      nombre:   words[0],
      apellido: words.slice(1).join(' '),
    };
  }
}
