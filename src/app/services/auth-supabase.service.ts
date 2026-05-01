import { Injectable } from '@angular/core';
import { Router } from '@angular/router';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { BehaviorSubject } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class AuthSupabaseService {
  private supabase: SupabaseClient;
  private userSubject = new BehaviorSubject<User | null>(null);
  private initializedSubject = new BehaviorSubject<boolean>(false);
  user$ = this.userSubject.asObservable();
  initialized$ = this.initializedSubject.asObservable();

  get client(): SupabaseClient { return this.supabase; }

  constructor(private router: Router) {
    this.supabase = createClient(
      environment.supabase.url,
      environment.supabase.anonKey,
      {
        auth: {
          // Evita NavigatorLockAcquireTimeoutError en entornos con múltiples
          // pestañas o iframes que compiten por el mismo lock del navegador.
          lock: <R>(_name: string, _timeout: number, fn: () => Promise<R>): Promise<R> => fn(),
        },
      }
    );

    this.supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user ?? null;
      this.userSubject.next(user);

      if (!this.initializedSubject.value) {
        this.initializedSubject.next(true);
      }

      // Google OAuth: sincronizar perfil y redirigir
      if (event === 'SIGNED_IN' && user?.app_metadata?.['provider'] === 'google') {
        this.syncGoogleProfile(user);
        this.router.navigate(['/client/dashboard']);
      }
    });
  }

  // ----------------------------------------------------------
  // Login con email y contraseña
  // ----------------------------------------------------------
  async signInWithEmail(email: string, password: string): Promise<void> {
    const { error } = await this.supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
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
    perfil: { nombre: string; apellido: string; telefono: string }
  ): Promise<void> {
    const { data, error } = await this.supabase.auth.signUp({
      email,
      password,
      options: {
        data: {                       // ← FIX 1: options.data alimenta raw_user_meta_data
          nombre:   perfil.nombre,    //   el trigger lee estas claves exactas
          apellido: perfil.apellido,
          telefono: perfil.telefono,
        },
      },
    });

    if (error) throw error;

    // Guardia: si el trigger no creó el perfil (caso raro),
    // lo creamos directamente desde Angular.
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
    perfil: { nombre: string; apellido: string; telefono: string }
  ): Promise<void> {
    // Verificar si el trigger ya creó el perfil completo
    const { data: existente } = await this.supabase
      .from('perfil')
      .select('id, perfil_completo')
      .eq('id', userId)             // ← FIX 2: 'id' no 'user_id'
      .single();

    // Si ya existe y está completo, el trigger funcionó — no hacer nada
    if (existente?.perfil_completo === true) return;

    const campos = {
      nombre:           perfil.nombre,
      apellido:         perfil.apellido,
      telefono:         perfil.telefono,
      rol:              'cliente',
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

    const campos: Record<string, unknown> = {
      avatar_url: avatarUrl || null,
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