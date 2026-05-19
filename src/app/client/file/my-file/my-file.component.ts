import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { ExpedienteService } from '../../../services/expediente.service';
import { OfertaService } from '../../../services/oferta.service';
import { ArchivoService } from '../../../services/archivo.service';
import { ExpedienteVistaCliente, OfertaConConstructor, ArchivoRow } from '../../../models';


@Component({
  selector: 'app-my-file',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './my-file.component.html',
  styleUrl:    './my-file.component.css',
})
export class MyFileComponent implements OnInit {
  private sanitizer         = inject(DomSanitizer);
  private expedienteService = inject(ExpedienteService);
  private ofertaService     = inject(OfertaService);
  private archivoService    = inject(ArchivoService);
  private route             = inject(ActivatedRoute);
  private router            = inject(Router);

  detalle        = signal<ExpedienteVistaCliente | null>(null);
  ofertaAceptada = signal<OfertaConConstructor | null>(null);
  fotos          = signal<ArchivoRow[]>([]);
  documentos     = signal<ArchivoRow[]>([]);
  fotoAmpliada   = signal<string | null>(null);
  cargando       = signal(true);
  errorMsg       = signal('');

  readonly ESTADO_CFG: Record<string, { texto: string; clase: string; icono: string }> = {
    nuevo:         { texto: 'Nuevo',       clase: 'bg-primary-subtle text-primary',            icono: 'bi-inbox' },
    en_estimacion: { texto: 'En revisión', clase: 'bg-info-subtle text-info-emphasis',         icono: 'bi-clipboard2-pulse' },
    estimado:      { texto: 'Estimado',    clase: 'bg-success-subtle text-success',            icono: 'bi-check-circle' },
    en_oferta:     { texto: 'Con ofertas', clase: 'bg-warning-subtle text-warning-emphasis',   icono: 'bi-cash-coin' },
    adjudicado:    { texto: 'Adjudicado',  clase: 'bg-warning-subtle text-warning-emphasis',   icono: 'bi-trophy' },
    contratado:    { texto: 'Contratado',  clase: 'bg-success-subtle text-success',            icono: 'bi-file-earmark-check' },
    cancelado:     { texto: 'Cancelado',   clase: 'bg-secondary-subtle text-secondary',        icono: 'bi-x-circle' },
  };

  readonly ESTADO_HINT: Record<string, string> = {
    nuevo:         'Tu solicitud fue recibida. Pronto se asignará un estimador.',
    en_estimacion: 'Un estimador está evaluando tu caso en sitio.',
    estimado:      'La estimación está lista. Los constructores pueden enviar propuestas.',
    en_oferta:     'Hay propuestas de constructores disponibles para revisar.',
    adjudicado:    'Constructor seleccionado. El contrato está en proceso.',
    contratado:    '¡Proyecto contratado! El trabajo está en marcha.',
    cancelado:     'Este expediente fue cancelado y ya no está activo.',
  };

  readonly ESTADO_PROGRESO: Record<string, number> = {
    nuevo:         15,
    en_estimacion: 30,
    estimado:      50,
    en_oferta:     65,
    adjudicado:    80,
    contratado:    100,
    cancelado:     0,
  };

  readonly PASOS: { key: string; icon: string; label: string }[] = [
    { key: 'nuevo',         icon: 'bi-inbox',              label: 'Recibido'    },
    { key: 'en_estimacion', icon: 'bi-clipboard2-pulse',   label: 'En revisión' },
    { key: 'estimado',      icon: 'bi-check-circle',       label: 'Estimado'    },
    { key: 'en_oferta',     icon: 'bi-cash-coin',          label: 'Con ofertas' },
    { key: 'adjudicado',    icon: 'bi-trophy',             label: 'Adjudicado'  },
    { key: 'contratado',    icon: 'bi-file-earmark-check', label: 'Contratado'  },
  ];

  progreso(estado: string): number {
    return this.ESTADO_PROGRESO[estado] ?? 0;
  }

  pasoActivo(pasoKey: string, estadoActual: string): 'done' | 'active' | 'pending' {
    if (estadoActual === 'cancelado') return 'pending';
    const keys    = ['nuevo', 'en_estimacion', 'estimado', 'en_oferta', 'adjudicado', 'contratado'];
    const iActual = keys.indexOf(estadoActual);
    const iPaso   = keys.indexOf(pasoKey);
    if (iPaso < iActual)  return 'done';
    if (iPaso === iActual) return 'active';
    return 'pending';
  }

  get urlTourSafe(): SafeResourceUrl | null {
    const url = this.detalle()?.url_tour;
    return url ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
  }

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.cargando.set(false); return; }

    try {
      const [detalle, ofertas, archivos] = await Promise.all([
        this.expedienteService.getVistaParaCliente(id),
        this.ofertaService.getOfertasDeExpediente(id),
        this.archivoService.cargarTodos(id),
      ]);
      this.detalle.set(detalle);
      this.ofertaAceptada.set(ofertas.find(o => o.estado === 'aceptada') ?? null);
      this.fotos.set(archivos.fotos);
      this.documentos.set(archivos.documentos);
    } catch (e: any) {
      console.error('[MyFile]', e.message);
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  estadoCfg(estado: string) {
    return this.ESTADO_CFG[estado] ?? { texto: estado, clase: 'bg-secondary-subtle text-secondary', icono: 'bi-question-circle' };
  }

  formatFecha(valor: string | null): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    return isNaN(d.getTime()) ? '—'
      : d.toLocaleDateString('es-CR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  formatHora(valor: string | null): string {
    if (!valor || !valor.includes('T')) return '—';
    return valor.split('T')[1]?.slice(0, 5) ?? '—';
  }

  formatCosto(valor: number | null): string {
    if (valor === null) return '—';
    return new Intl.NumberFormat('es-CR', { style: 'currency', currency: 'CRC' }).format(valor);
  }

  publicUrl(storagePath: string): string {
    return this.archivoService.publicUrl(storagePath);
  }

  formatTamano(bytes: number): string {
    if (bytes < 1_024)     return `${bytes} B`;
    if (bytes < 1_048_576) return `${(bytes / 1_024).toFixed(1)} KB`;
    return `${(bytes / 1_048_576).toFixed(1)} MB`;
  }

  abrirFoto(archivo: ArchivoRow) {
    this.fotoAmpliada.set(this.publicUrl(archivo.url_storage));
  }

  cerrarFoto() { this.fotoAmpliada.set(null); }

  volver() { this.router.navigate(['/client/file/my-files']); }
}
