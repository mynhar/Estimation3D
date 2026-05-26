import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { combineLatest, filter, firstValueFrom, map, take } from 'rxjs';
import { AuthSupabaseService } from './services/auth-supabase.service';
import { ROLES_ESTIMADOR, ROLES_CONSTRUCTOR, ROLES_ADMINISTRADOR } from './roles';
import { RolUsuario } from './types/supabase';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthSupabaseService);
  const router = inject(Router);

  return combineLatest([auth.initialized$, auth.user$]).pipe(
    filter(([initialized]) => initialized),
    take(1),
    map(([, user]) => (user ? true : router.createUrlTree(['/login'])))
  );
};

// Helper: espera a que rol$ tenga un valor resuelto (no undefined = cargando)
async function resolverRol(auth: AuthSupabaseService): Promise<RolUsuario | null> {
  return firstValueFrom(
    auth.rol$.pipe(
      filter((r): r is RolUsuario | null => r !== undefined),
      take(1),
    )
  );
}

export const estimatorGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);

  const [, user] = await firstValueFrom(
    combineLatest([auth.initialized$, auth.user$]).pipe(
      filter(([initialized]) => initialized),
      take(1),
    )
  );

  if (!user) return router.createUrlTree(['/login']);

  const rol = await resolverRol(auth);
  return rol && ROLES_ESTIMADOR.includes(rol)
    ? true
    : router.createUrlTree(['/client/dashboard']);
};

export const constructorGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);

  const [, user] = await firstValueFrom(
    combineLatest([auth.initialized$, auth.user$]).pipe(
      filter(([initialized]) => initialized),
      take(1),
    )
  );

  if (!user) return router.createUrlTree(['/login']);

  const rol = await resolverRol(auth);
  return rol && ROLES_CONSTRUCTOR.includes(rol)
    ? true
    : router.createUrlTree(['/client/dashboard']);
};

export const adminGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);

  const [, user] = await firstValueFrom(
    combineLatest([auth.initialized$, auth.user$]).pipe(
      filter(([initialized]) => initialized),
      take(1),
    )
  );

  if (!user) return router.createUrlTree(['/login']);

  const rol = await resolverRol(auth);
  return rol && ROLES_ADMINISTRADOR.includes(rol)
    ? true
    : router.createUrlTree(['/client/dashboard']);
};

export const wildcardGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);

  const [, user] = await firstValueFrom(
    combineLatest([auth.initialized$, auth.user$]).pipe(
      filter(([initialized]) => initialized),
      take(1)
    )
  );

  if (!user) return router.createUrlTree(['/login']);
  return router.createUrlTree([await auth.getHomeRoute()]);
};

export const guestGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);

  const [, user] = await firstValueFrom(
    combineLatest([auth.initialized$, auth.user$]).pipe(
      filter(([initialized]) => initialized),
      take(1)
    )
  );

  if (!user) return true;
  return router.createUrlTree([await auth.getHomeRoute()]);
};
