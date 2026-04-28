import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { combineLatest, filter, map, take } from 'rxjs';
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

export const guestGuard: CanActivateFn = () => {
  const auth = inject(AuthSupabaseService);
  const router = inject(Router);

  return combineLatest([auth.initialized$, auth.user$]).pipe(
    filter(([initialized]) => initialized),
    take(1),
    map(([, user]) => (user ? router.createUrlTree(['/client/dashboard']) : true))
  );
};
