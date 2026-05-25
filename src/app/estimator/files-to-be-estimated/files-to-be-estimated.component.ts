import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ExpedienteRow } from '../../models';

@Component({
  selector: 'app-files-to-be-estimated',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './files-to-be-estimated.component.html',
  styleUrl:    './files-to-be-estimated.component.css',
})
export class FilesToBeEstimatedComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private translate         = inject(TranslateService);
  private router            = inject(Router);

  user         = toSignal(this.auth.user$);
  expedientes  = signal<ExpedienteRow[]>([]);
  cargando     = signal(true);
  busqueda     = signal('');
  soloUrgentes = signal(false);

  expedientesFiltrados = computed(() => {
    const q = this.busqueda().toLowerCase().trim();
    const u = this.soloUrgentes();
    return this.expedientes().filter(e => {
      if (u && this.urgencia(e.fecha_visita) === null) return false;
      if (!q) return true;
      return (
        e.numero.toLowerCase().includes(q)          ||
        e.servicio_nombre.toLowerCase().includes(q) ||
        e.cliente_nombre.toLowerCase().includes(q)  ||
        e.provincia.toLowerCase().includes(q)       ||
        e.canton.toLowerCase().includes(q)
      );
    });
  });

  hayFiltros    = computed(() => this.busqueda() !== '' || this.soloUrgentes());
  urgentesCount = computed(() =>
    this.expedientes().filter(e => this.urgencia(e.fecha_visita) !== null).length
  );

  async ngOnInit() {
    try {
      this.expedientes.set(
        await this.expedienteService.getExpedienteRows({ estado: 'nuevo' })
      );
    } catch (e: any) {
      console.error('[FilesToBeEstimated]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  urgencia(fechaVisita: string): 'vencida' | 'hoy' | 'proxima' | null {
    if (!fechaVisita) return null;
    const raw  = fechaVisita.includes('T') ? fechaVisita.split('T')[0] : fechaVisita;
    const d    = new Date(`${raw}T00:00:00`);
    const hoy  = new Date(); hoy.setHours(0, 0, 0, 0);
    const diff = d.getTime() - hoy.getTime();
    if (diff < 0)                         return 'vencida';
    if (diff === 0)                        return 'hoy';
    if (diff <= 2 * 24 * 60 * 60 * 1000)  return 'proxima';
    return null;
  }

  formatFecha(valor: string): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    const parts  = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return this.translate.currentLang === 'en'
      ? `${p['month']} ${p['day']}, ${p['year']}`
      : `${p['day']} ${p['month']} ${p['year']}`;
  }

  limpiarFiltros() {
    this.busqueda.set('');
    this.soloUrgentes.set(false);
  }

  async estimar(id: string) {
    const userId = this.user()?.id;
    if (!userId) return;
    try {
      await this.expedienteService.asignarEstimador(id, userId);
      this.router.navigate(['/estimator/file-to-be-estimated', id]);
    } catch (e: any) {
      console.error('[FilesToBeEstimated] estimar:', e.message);
    }
  }
}
