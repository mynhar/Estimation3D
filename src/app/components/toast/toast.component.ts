import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toast-container position-fixed bottom-0 end-0 p-3" style="z-index: 1100">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast show align-items-center border-0 mb-2"
             [class]="'text-bg-' + t.type"
             role="alert" aria-live="assertive">
          <div class="d-flex">
            <div class="toast-body">{{ t.message }}</div>
            <button type="button"
                    class="btn-close btn-close-white me-2 m-auto"
                    aria-label="Cerrar"
                    (click)="toast.dismiss(t.id)">
            </button>
          </div>
        </div>
      }
    </div>
  `,
})
export class ToastComponent {
  toast = inject(ToastService);
}
