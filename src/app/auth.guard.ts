import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { combineLatest, filter, firstValueFrom, map, take } from 'rxjs';
import { AuthSupabaseService } from './services/auth-supabase.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthSupabaseService);
  const router = inject(Router);

  return combineLatest([auth.initialized$, auth.user$]).pipe(
    filter(([initialized]) => initialized),
    take(1),
    map(([, user]) => (user ? true : router.createUrlTree(['/login'])))
  );
};

const ROLES_ESTIMADOR = ['estimador', 'administrador'];

export const estimatorGuard: CanActivateFn = async () => {
  const auth   = inject(AuthSupabaseService);
  const router = inject(Router);

  const [, user] = await firstValueFrom(
    combineLatest([auth.initialized$, auth.user$]).pipe(
      filter(([initialized]) => initialized),
      take(1)
    )
  );

  if (!user) return router.createUrlTree(['/login']);

  const { data, error } = await auth.client
    .from('perfil')
    .select('rol')
    .eq('id', user.id)
    .single();

  if (error) return router.createUrlTree(['/login']);

  return data?.rol && ROLES_ESTIMADOR.includes(data.rol)
    ? true
    : router.createUrlTree(['/client/dashboard']);
};

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthSupabaseService);
  const router = inject(Router);

  return combineLatest([auth.initialized$, auth.user$]).pipe(
    filter(([initialized]) => initialized),
    take(1),
    map(([, user]) => (user ? router.createUrlTree(['/client/dashboard']) : true))
  );
};
