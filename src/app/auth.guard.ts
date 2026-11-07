import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthSupabaseService } from './services/auth-supabase.service';
import { ROLES_ESTIMADOR, ROLES_CONSTRUCTOR, ROLES_ADMINISTRADOR } from './roles';

export const authGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);
  const user   = await auth.esperarUsuario();
  return user ? true : router.createUrlTree(['/login']);
};

export const estimatorGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);
  const user   = await auth.esperarUsuario();
  if (!user) return router.createUrlTree(['/login']);
  const rol    = await auth.esperarRol();
  return rol && ROLES_ESTIMADOR.includes(rol)
    ? true
    : router.createUrlTree([await auth.getHomeRoute()]);
};

export const constructorGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);
  const user   = await auth.esperarUsuario();
  if (!user) return router.createUrlTree(['/login']);
  const rol    = await auth.esperarRol();
  return rol && ROLES_CONSTRUCTOR.includes(rol)
    ? true
    : router.createUrlTree([await auth.getHomeRoute()]);
};

export const adminGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);
  const user   = await auth.esperarUsuario();
  if (!user) return router.createUrlTree(['/login']);
  const rol    = await auth.esperarRol();
  return rol && ROLES_ADMINISTRADOR.includes(rol)
    ? true
    : router.createUrlTree([await auth.getHomeRoute()]);
};

export const wildcardGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);
  const user   = await auth.esperarUsuario();
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
  const user   = await auth.esperarUsuario();
  if (!user) return true;
  try {
    return router.createUrlTree([await auth.getHomeRoute()]);
  } catch {
    return true;
  }
};
