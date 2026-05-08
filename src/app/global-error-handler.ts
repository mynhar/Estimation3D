import { ErrorHandler, Injectable, Injector, inject } from '@angular/core';
import { ToastService } from './services/toast.service';

@Injectable()
export class GlobalErrorHandler implements ErrorHandler {
  // Lazy injection via Injector avoids circular dependency with Angular's own DI setup
  private injector = inject(Injector);

  handleError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[GlobalError]', error);
    this.injector.get(ToastService).show(message);
  }
}
