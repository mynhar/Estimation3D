import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteService } from '../../services/expediente.service';
import { ExpedienteRow } from '../../models';
import { coincideBusqueda, direccionLinea1, direccionLinea2, direccionCompleta } from '../../shared/util/busqueda';

type VistaExpedientes = 'tabla' | 'tarjetas';

@Component({
  selector: 'app-files-under-estimation',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './files-under-estimation.component.html',
  styleUrl:    './files-under-estimation.component.css',
})
export class FilesUnderEstimationComponent implements OnInit {
  private auth              = inject(AuthSupabaseService);
  private expedienteService = inject(ExpedienteService);
  private translate         = inject(TranslateService);
  private router            = inject(Router);

  user          = toSignal(this.auth.user$);
  expedientes   = signal<ExpedienteRow[]>([]);
  cargando      = signal(true);
  busqueda      = signal('');
  soloUrgentes  = signal(false);
  liberandoId   = signal<string | null>(null);
  confirmandoId = signal<string | null>(null);
  vista         = signal<VistaExpedientes>('tarjetas');

  /** Ids cuya miniatura 3D falló al cargar → se muestra el marcador de posición. */
  private fotosFallidas = signal<Set<string>>(new Set<string>());

  expedientesFiltrados = computed(() => {
    const q = this.busqueda().trim();
    const u = this.soloUrgentes();
    return this.expedientes().filter(e => {
      if (u && this.urgencia(e.fecha_visita) === null) return false;
      if (!q) return true;
      const haystack = [
        e.numero,
        e.servicio_nombre,
        e.servicio_nombre_en,
        e.servicio_nombre_fr,
        e.cliente_nombre,
        // Dirección: en Canadá `direccion` lleva unidad + nº y calle,
        // `canton` la ciudad y `distrito` el código postal.
        e.direccion,
        e.canton,
        e.provincia,
        e.distrito,
      ].join(' ');
      return coincideBusqueda(haystack, q);
    });
  });

  // ── Dirección (formato postal en dos líneas) ─────────────────────────────
  direccionLinea1   = direccionLinea1;
  direccionLinea2   = direccionLinea2;
  direccionCompleta = direccionCompleta;

  urgentesCount = computed(() =>
    this.expedientes().filter(e => this.urgencia(e.fecha_visita) !== null).length
  );

  hayFiltros = computed(() => this.busqueda() !== '' || this.soloUrgentes());

  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.cargando.set(false); return; }
    try {
      this.expedientes.set(await this.expedienteService.getExpedienteRows({
        estado:      'en_estimacion',
        estimadorId: userId,
      }));
    } catch (e: any) {
      console.error('[FilesUnderEstimation]', e.message);
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
    if (diff < 0)                        return 'vencida';
    if (diff === 0)                       return 'hoy';
    if (diff <= 2 * 24 * 60 * 60 * 1000) return 'proxima';
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

  formatHora(valor: string): string {
    if (!valor) return '—';
    if (valor.includes('T')) {
      const time = valor.split('T')[1]?.slice(0, 5);
      return time ?? '—';
    }
    return '—';
  }

  servicioNombre(exp: ExpedienteRow): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return exp.servicio_nombre_en || exp.servicio_nombre;
    if (lang === 'fr') return exp.servicio_nombre_fr || exp.servicio_nombre;
    return exp.servicio_nombre;
  }

  limpiarFiltros() {
    this.busqueda.set('');
    this.soloUrgentes.set(false);
  }

  setVista(v: VistaExpedientes) {
    this.vista.set(v);
  }

  /**
   * Miniatura del expediente extraída del tour 3D Matterport.
   * Null si el expediente no tiene tour o si la imagen ya falló al cargar.
   */
  fotoExpediente(exp: ExpedienteRow): string | null {
    return this.fotosFallidas().has(exp.id) ? null : exp.foto;
  }

  onFotoError(id: string) {
    this.fotosFallidas.update(set => new Set(set).add(id));
  }

  estimar(id: string) {
    this.router.navigate(['/estimator/file-under-estimation', id]);
  }

  /**
   * Clic en cualquier parte de la tarjeta o fila. No navega mientras la
   * confirmación de liberación de ese expediente está abierta.
   */
  abrir(id: string) {
    if (this.confirmandoId() === id) return;
    this.estimar(id);
  }

  confirmarLiberar(id: string) {
    if (this.confirmandoId() === id) {
      this.confirmandoId.set(null);
      this.liberar(id);
    } else {
      this.confirmandoId.set(id);
      setTimeout(() => {
        if (this.confirmandoId() === id) this.confirmandoId.set(null);
      }, 4000);
    }
  }

  async liberar(id: string) {
    this.liberandoId.set(id);
    try {
      await this.expedienteService.liberar(id);
      this.expedientes.update(rows => rows.filter(e => e.id !== id));
    } catch (e: any) {
      console.error('[FilesUnderEstimation] liberar:', e.message);
    } finally {
      this.liberandoId.set(null);
    }
  }
}
