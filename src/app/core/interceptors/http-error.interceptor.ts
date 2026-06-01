import { inject, Injector } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { TranslateService } from '@ngx-translate/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../../services/toast.service';

// Requests to this path load translation files — never redirect or toast on these.
const I18N_PATH = '/assets/i18n/';

export const httpErrorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast    = inject(ToastService);
  const router   = inject(Router);
  // TranslateService resolved lazily to break the circular DI cycle:
  // TranslateService → TranslateHttpLoader → HttpClient → this interceptor → TranslateService
  const injector = inject(Injector);

  const isI18n = req.url.includes(I18N_PATH);

  return next(req).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || isI18n) {
        return throwError(() => err);
      }

      const t = injector.get(TranslateService);

      if (err.status === 0) {
        toast.show(t.instant('http.offline'), 'warning');
      } else if (err.status === 401) {
        toast.show(t.instant('http.unauthorized'), 'warning');
        router.navigate(['/login']);
      } else if (err.status === 403) {
        toast.show(t.instant('http.forbidden'), 'danger');
      } else if (err.status >= 500) {
        toast.show(t.instant('http.server_error'), 'danger');
      }

      return throwError(() => err);
    }),
  );
};
