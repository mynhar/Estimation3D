import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { catchError, combineLatest, filter, firstValueFrom, of, take, timeout } from 'rxjs';
import { AuthSupabaseService } from './services/auth-supabase.service';
import { ROLES_ESTIMADOR, ROLES_CONSTRUCTOR, ROLES_ADMINISTRADOR } from './roles';
import { RolUsuario } from './types/supabase';

const GUARD_TIMEOUT_MS = 8_000;

// Espera a que el estado de auth se inicialice. Si tarda más de 8s, asume no autenticado.
async function esperarAuth(
  auth: AuthSupabaseService,
): Promise<[boolean, import('@supabase/supabase-js').User | null]> {
  return firstValueFrom(
    combineLatest([auth.initialized$, auth.user$]).pipe(
      filter(([initialized]) => initialized),
      take(1),
      timeout(GUARD_TIMEOUT_MS),
      catchError(() => of([true, null] as [boolean, null])),
    ),
  );
}

// Espera a que el rol se resuelva (no undefined). Timeout → null (sin acceso).
async function resolverRol(auth: AuthSupabaseService): Promise<RolUsuario | null> {
  return firstValueFrom(
    auth.rol$.pipe(
      filter((r): r is RolUsuario | null => r !== undefined),
      take(1),
      timeout(GUARD_TIMEOUT_MS),
      catchError(() => of(null)),
    ),
  );
}

export const authGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);
  const [, user] = await esperarAuth(auth);
  return user ? true : router.createUrlTree(['/login']);
};

export const estimatorGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);
  const [, user] = await esperarAuth(auth);
  if (!user) return router.createUrlTree(['/login']);
  const rol = await resolverRol(auth);
  return rol && ROLES_ESTIMADOR.includes(rol)
    ? true
    : router.createUrlTree(['/client/dashboard']);
};

export const constructorGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);
  const [, user] = await esperarAuth(auth);
  if (!user) return router.createUrlTree(['/login']);
  const rol = await resolverRol(auth);
  return rol && ROLES_CONSTRUCTOR.includes(rol)
    ? true
    : router.createUrlTree(['/client/dashboard']);
};

export const adminGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);
  const [, user] = await esperarAuth(auth);
  if (!user) return router.createUrlTree(['/login']);
  const rol = await resolverRol(auth);
  return rol && ROLES_ADMINISTRADOR.includes(rol)
    ? true
    : router.createUrlTree(['/client/dashboard']);
};

export const wildcardGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);
  const [, user] = await esperarAuth(auth);
  if (!user) return router.createUrlTree(['/login']);
  try {
    return router.createUrlTree([await auth.getHomeRoute()]);
  } catch {
    return router.createUrlTree(['/login']);
  }
};

export const guestGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);
  const [, user] = await esperarAuth(auth);
  if (!user) return true;
  try {
    return router.createUrlTree([await auth.getHomeRoute()]);
  } catch {
    return true;
  }
};
