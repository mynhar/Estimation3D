import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ExpedienteService } from '../../services/expediente.service';
import { ExpedienteDisponible } from '../../models';

@Component({
  selector: 'app-available-files',
  standalone: true,
  imports: [],
  templateUrl: './available-files.component.html',
  styleUrl: './available-files.component.css',
})
export class AvailableFilesComponent implements OnInit {
  private expedienteService = inject(ExpedienteService);
  private router            = inject(Router);

  expedientes = signal<ExpedienteDisponible[]>([]);
  cargando    = signal(true);

  async ngOnInit() {
    try {
      this.expedientes.set(await this.expedienteService.getExpedientesDisponibles());
    } catch (e: any) {
      console.error('[AvailableFiles]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  formatCosto(valor: number | null): string {
    if (valor === null) return '—';
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(valor);
  }

  hacerOferta(id: string) {
    this.router.navigate(['/builder/make-offer', id]);
  }
}
