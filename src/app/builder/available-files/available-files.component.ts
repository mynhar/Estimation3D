import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { OfertaService } from '../../services/oferta.service';
import { ExpedienteDisponible } from '../../models';

@Component({
  selector: 'app-available-files',
  standalone: true,
  imports: [],
  templateUrl: './available-files.component.html',
  styleUrl: './available-files.component.css',
})
export class AvailableFilesComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private ofertaService     = inject(OfertaService);
  private router            = inject(Router);

  user        = toSignal(this.auth.user$);
  expedientes = signal<ExpedienteDisponible[]>([]);
  ofertasHechas = signal<Set<string>>(new Set());
  cargando    = signal(true);

  async ngOnInit() {
    const userId = this.user()?.id;
    try {
      const [expedientes, ofertasHechas] = await Promise.all([
        this.expedienteService.getExpedientesDisponibles(),
        userId ? this.ofertaService.getExpedienteIdsConOferta(userId) : Promise.resolve(new Set<string>()),
      ]);
      this.expedientes.set(expedientes);
      this.ofertasHechas.set(ofertasHechas);
    } catch (e: any) {
      console.error('[AvailableFiles]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  tieneOferta(expedienteId: string): boolean {
    return this.ofertasHechas().has(expedienteId);
  }

  formatCosto(valor: number | null): string {
    if (valor === null) return '—';
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(valor);
  }

  hacerOferta(id: string) {
    this.router.navigate(['/builder/make-offer', id]);
  }
}
