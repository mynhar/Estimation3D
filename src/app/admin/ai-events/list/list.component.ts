import { ChangeDetectionStrategy, Component, OnInit, computed, effect, inject, signal } from '@angular/core';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AsistenteEventoRepository, AsistenteEvento, TipoEvento } from '../../../data';
import { ToastService } from '../../../services/toast.service';
import { PaginationComponent } from '../../../shared/pagination/pagination.component';

type FiltroTipo    = 'todos' | TipoEvento;
type FiltroResuelto = 'todos' | 'pendiente' | 'resuelto';

@Component({
  selector: 'app-admin-ai-events-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, PaginationComponent],
  templateUrl: './list.component.html',
  styleUrls: ['../../_shared/crud-list.css'],
})
export class AdminAiEventsListComponent implements OnInit {
  private repo      = inject(AsistenteEventoRepository);
  private translate = inject(TranslateService);
  private toast     = inject(ToastService);

  private _eventos = signal<AsistenteEvento[]>([]);
  cargando   = signal(true);
  error      = signal<string | null>(null);
  actualizando = signal<string | null>(null);

  filtroTipo     = signal<FiltroTipo>('todos');
  filtroResuelto = signal<FiltroResuelto>('pendiente');

  readonly TIPOS: FiltroTipo[] = [
    'todos', 'salud_mencionada', 'escalada_humana', 'caso_externo',
    'evidencia_incompleta_imprevisto', 'imprevisto_anticipado', 'candidato_imprevisto',
  ];
  readonly RESUELTOS: FiltroResuelto[] = ['todos', 'pendiente', 'resuelto'];

  readonly POR_PAGINA = 12;
  paginaActual = signal(1);

  eventosFiltrados = computed(() => {
    const tipo = this.filtroTipo();
    const res  = this.filtroResuelto();
    return this._eventos().filter(e => {
      if (tipo !== 'todos' && e.tipo !== tipo) return false;
      if (res === 'pendiente' && e.resuelto) return false;
      if (res === 'resuelto'  && !e.resuelto) return false;
      return true;
    });
  });

  eventosPaginados = computed(() => {
    const desde = (this.paginaActual() - 1) * this.POR_PAGINA;
    return this.eventosFiltrados().slice(desde, desde + this.POR_PAGINA);
  });

  hayFiltros = computed(() => this.filtroTipo() !== 'todos' || this.filtroResuelto() !== 'pendiente');
  pendientes = computed(() => this._eventos().filter(e => !e.resuelto).length);

  get total(): number { return this._eventos().length; }

  constructor() {
    effect(() => {
      this.filtroTipo();
      this.filtroResuelto();
      this.paginaActual.set(1);
    }, { allowSignalWrites: true });
  }

  async ngOnInit() {
    try {
      this._eventos.set(await this.repo.findAll());
    } catch (e: any) {
      this.error.set(e?.message ?? this.translate.instant('admin_ai_events.err_load'));
    } finally {
      this.cargando.set(false);
    }
  }

  limpiarFiltros() {
    this.filtroTipo.set('todos');
    this.filtroResuelto.set('todos');
  }

  async alternarResuelto(ev: AsistenteEvento) {
    if (this.actualizando()) return;
    this.actualizando.set(ev.id);
    const nuevo = !ev.resuelto;
    try {
      await this.repo.marcarResuelto(ev.id, nuevo);
      this._eventos.update(list => list.map(x => x.id === ev.id ? { ...x, resuelto: nuevo } : x));
    } catch (e: any) {
      this.toast.show(e?.message ?? this.translate.instant('admin_ai_events.err_update'), 'danger');
    } finally {
      this.actualizando.set(null);
    }
  }

  tipoLabel(tipo: string): string {
    return this.translate.instant('admin_ai_events.tipo.' + tipo);
  }

  tipoClase(tipo: string): string {
    switch (tipo) {
      case 'salud_mencionada':                return 'tipo-badge--salud';
      case 'escalada_humana':                 return 'tipo-badge--escalada';
      case 'caso_externo':                    return 'tipo-badge--externo';
      case 'evidencia_incompleta_imprevisto': return 'tipo-badge--evidencia';
      case 'imprevisto_anticipado':           return 'tipo-badge--imprevisto';
      case 'candidato_imprevisto':            return 'tipo-badge--candidato';
      default:                                return 'tipo-badge--evidencia';
    }
  }

  usuarioNombre(ev: AsistenteEvento): string {
    const u = ev.usuario;
    const n = `${u?.nombre ?? ''} ${u?.apellido ?? ''}`.trim();
    return n || '—';
  }

  rolLabel(rol: string): string {
    return this.translate.instant('role.' + rol);
  }

  fecha(iso: string): string {
    const lang = (this.translate.currentLang || 'fr').slice(0, 2);
    const locale = lang === 'es' ? 'es-ES' : lang === 'en' ? 'en-CA' : 'fr-CA';
    try {
      return new Date(iso).toLocaleString(locale, {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }
}
