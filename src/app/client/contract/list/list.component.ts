import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ExpedientePanelComponent } from '../../../shared/ui/expediente-panel/expediente-panel.component';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ContratoService } from '../../../services/contrato.service';
import { ToastService } from '../../../services/toast.service';
import { ContratoListItem, nombreServicio, serviciosParaContrato } from '../../../models';

@Component({
  selector: 'app-contract-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, NgTemplateOutlet, ExpedientePanelComponent],
  templateUrl: './list.component.html',
  styleUrl: './list.component.css',
})
export class ContractListComponent implements OnInit {
  private auth            = inject(AuthSupabaseService);
  private contratoService = inject(ContratoService);
  private toast           = inject(ToastService);
  private translate       = inject(TranslateService);
  private router          = inject(Router);
  private sanitizer       = inject(DomSanitizer);

  user      = toSignal(this.auth.user$);
  contratos = signal<ContratoListItem[]>([]);
  cargando  = signal(true);

  descargando      = signal<string | null>(null);
  firmandoId       = signal<string | null>(null);
  confirmandoId    = signal<string | null>(null);
  aceptado         = signal(false);
  confirmCancelId  = signal<string | null>(null);
  cancelandoId     = signal<string | null>(null);

  // ── PDF viewer ────────────────────────────────────────────────────────────
  pdfVistaId  = signal<string | null>(null);
  pdfBlobUrl  = signal<string | null>(null);

  // ── Agrupación por expediente (acordeón, como Mis documentos) ──────────────
  /** Expedientes abiertos. Arranca abierto el primero. */
  expandidos = signal<ReadonlySet<string>>(new Set());

  /**
   * Una entrada por expediente: los que tienen contratos activos primero. Dentro,
   * los activos y después los cerrados (completados / cancelados), cada bloque
   * en el orden en que llegan (el más reciente primero).
   */
  grupos = computed(() => {
    const porExp = new Map<string, ContratoListItem[]>();
    for (const c of this.contratos()) {
      const key = c.expediente_id || c.expediente_numero;
      porExp.set(key, [...(porExp.get(key) ?? []), c]);
    }
    const grupos = [...porExp.entries()].map(([key, cs]) => {
      const activos  = cs.filter(c => !this.esCerrado(c.estado));
      const cerrados = cs.filter(c =>  this.esCerrado(c.estado));
      return {
        key,
        numero:          cs[0].expediente_numero,
        activos,
        cerrados,
        total:           cs.length,
        valor:           cs.filter(c => c.estado !== 'cancelado').reduce((s, c) => s + (c.precio_final ?? 0), 0),
        obrasTerminadas: cs.filter(c => c.obra_terminada).length,
      };
    });
    return [...grupos.filter(g => g.activos.length), ...grupos.filter(g => !g.activos.length)];
  });

  resumen = computed(() => {
    const cs = this.contratos();
    return {
      total:       cs.length,
      activos:     cs.filter(c => !this.esCerrado(c.estado)).length,
      completados: cs.filter(c => c.estado === 'completado').length,
      valor:       cs.filter(c => c.estado !== 'cancelado').reduce((s, c) => s + (c.precio_final ?? 0), 0),
    };
  });

  esCerrado(estado: string): boolean { return estado === 'completado' || estado === 'cancelado'; }
  toggle(key: string): void {
    this.expandidos.update(set => {
      const next = new Set(set);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  isExpandido(key: string): boolean { return this.expandidos().has(key); }

  iniciales(nombre: string): string {
    const parts = (nombre ?? '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '—';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  iconoEstado(estado: string): string {
    switch (estado) {
      case 'firmado':      return 'bi-patch-check';
      case 'en_ejecucion': return 'bi-hammer';
      case 'completado':   return 'bi-check-circle';
      case 'cancelado':    return 'bi-x-circle';
      default:             return 'bi-clock-history';  // generado
    }
  }

  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.router.navigate(['/login']); return; }
    try {
      this.contratos.set(await this.contratoService.getMisContratos(userId));
      const primero = this.grupos()[0];
      if (primero) this.expandidos.set(new Set([primero.key]));
    } catch (e: any) {
      console.error('[ContractList]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Cancelación ───────────────────────────────────────────────────────────

  /** Con la obra al 100 % el trabajo ya está hecho: no se abre la cancelación. */
  abrirPanelCancelacion(c: ContratoListItem): void {
    if (c.obra_terminada) return;
    this.confirmCancelId.set(c.id);
    this.confirmandoId.set(null);
    this.aceptado.set(false);
  }

  cerrarPanelCancelacion(): void {
    this.confirmCancelId.set(null);
  }

  async confirmarCancelacion(c: ContratoListItem): Promise<void> {
    if (this.cancelandoId()) return;
    this.cancelandoId.set(c.id);
    try {
      await this.contratoService.cancelarContrato(c.id);
      this.contratos.update(list =>
        list.map(item => item.id === c.id ? { ...item, estado: 'cancelado' } : item)
      );
      this.cerrarPanelCancelacion();
      this.toast.show(this.translate.instant('contract_list.success_cancelled'), 'success');
    } catch (e: any) {
      console.error('[ContractList] cancelarContrato:', e.message);
      this.toast.show(this.translate.instant('contract_list.err_cancel'), 'danger');
    } finally {
      this.cancelandoId.set(null);
    }
  }

  // ── Firma ─────────────────────────────────────────────────────────────────

  abrirPanelFirma(id: string): void {
    this.confirmandoId.set(id);
    this.confirmCancelId.set(null);
    this.aceptado.set(false);
  }

  cerrarPanelFirma(): void {
    this.confirmandoId.set(null);
    this.aceptado.set(false);
  }

  toggleAceptado(): void {
    this.aceptado.update(v => !v);
  }

  async confirmarFirma(c: ContratoListItem): Promise<void> {
    if (!this.aceptado() || this.firmandoId()) return;
    this.firmandoId.set(c.id);
    try {
      await this.contratoService.firmarContrato(c.id);
      this.contratos.update(list =>
        list.map(item => item.id === c.id
          ? { ...item, estado: 'firmado', firmado_en: new Date().toISOString() }
          : item
        )
      );
      this.cerrarPanelFirma();
      this.toast.show(this.translate.instant('contract_list.success_signed'), 'success');
    } catch (e: any) {
      console.error('[ContractList] firmarContrato:', e.message);
      this.toast.show(this.translate.instant('contract_list.err_sign'), 'danger');
    } finally {
      this.firmandoId.set(null);
    }
  }

  // ── PDF — generación compartida ───────────────────────────────────────────

  private generarBlob(c: ContratoListItem): Blob {
    const lang = this.translate.currentLang ?? 'fr';
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-CA', fr: 'fr-CA' };
    const fechaGenerado = new Intl.DateTimeFormat(
      localeMap[lang] ?? 'fr-CA',
      { day: 'numeric', month: 'long', year: 'numeric' },
    ).format(new Date(c.generado_en || Date.now()));

    const svcNombre =
      lang === 'en' ? (c.servicio_nombre_en || c.servicio_nombre)
    : lang === 'fr' ? (c.servicio_nombre_fr || c.servicio_nombre)
    : c.servicio_nombre;

    const svcDesc =
      lang === 'en' ? (c.servicio_desc_en || c.servicio_desc)
    : lang === 'fr' ? (c.servicio_desc_fr || c.servicio_desc)
    : c.servicio_desc;

    return this.contratoService.generarPdfBlob({
      contratoId:          c.id,
      expedienteNumero:    c.expediente_numero,
      fechaGenerado,
      clienteNombre:       c.cliente_nombre,
      constructorNombre:   c.constructor_nombre,
      constructorTelefono: c.constructor_telefono,
      constructorEmail:    c.constructor_email,
      // Los servicios de ESTE contrato (`contrato.servicio_ids`), no el principal
      // del expediente: con varios contratos cada uno cubre lo suyo. Sin lista,
      // la forma antigua.
      servicios:           c.servicios?.length ? serviciosParaContrato(c.servicios, lang) : undefined,
      servicioNombre:      svcNombre,
      servicioDescripcion: svcDesc,
      direccion:           c.direccion,
      canton:              c.canton,
      provincia:           c.provincia,
      distrito:            c.distrito ?? '',
      precioFinal:         c.precio_final,
      plazoMin:            c.plazo_semanas_min,
      plazoMax:            c.plazo_semanas_max,
      garantiaAnos:        c.garantia_anos,
      fechaInicio:         c.fecha_inicio ?? '',
      descripcionTrabajo:  c.descripcion_trabajo,
      lang,
    });
  }

  // ── PDF — descarga ────────────────────────────────────────────────────────

  descargarPdf(c: ContratoListItem) {
    if (this.descargando()) return;
    this.descargando.set(c.id);
    try {
      const blob   = this.generarBlob(c);
      const objUrl = URL.createObjectURL(blob);
      const a      = document.createElement('a');
      a.href     = objUrl;
      a.download = `contrato-${c.expediente_numero}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (e: any) {
      console.error('[ContractList] descargarPdf:', e.message);
    } finally {
      this.descargando.set(null);
    }
  }

  // ── PDF — visor inline ────────────────────────────────────────────────────

  togglePdf(c: ContratoListItem): void {
    if (this.pdfVistaId() === c.id) {
      if (this.pdfBlobUrl()) URL.revokeObjectURL(this.pdfBlobUrl()!);
      this.pdfVistaId.set(null);
      this.pdfBlobUrl.set(null);
      return;
    }
    if (this.pdfBlobUrl()) URL.revokeObjectURL(this.pdfBlobUrl()!);
    try {
      const blob = this.generarBlob(c);
      this.pdfBlobUrl.set(URL.createObjectURL(blob));
      this.pdfVistaId.set(c.id);
    } catch (e: any) {
      console.error('[ContractList] togglePdf:', e.message);
    }
  }

  safePdfUrl(): SafeResourceUrl {
    return this.sanitizer.bypassSecurityTrustResourceUrl(this.pdfBlobUrl() ?? '');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Servicios de ESTE contrato (`contrato.servicio_ids`). Antes enseñaba el
   * principal del expediente, el mismo en todos los contratos aunque cada uno
   * cubriera un servicio distinto. Sin lista, el principal.
   */
  servicioNombre(c: ContratoListItem): string {
    const lang = this.translate.currentLang;
    if (c.servicios?.length) {
      return c.servicios.map(s => nombreServicio(s, lang)).filter(Boolean).join(' · ');
    }
    if (lang === 'en') return c.servicio_nombre_en || c.servicio_nombre;
    if (lang === 'fr') return c.servicio_nombre_fr || c.servicio_nombre;
    return c.servicio_nombre;
  }

  estadoBadge(estado: string): string {
    const map: Record<string, string> = {
      generado:     'badge-generado',
      firmado:      'badge-firmado',
      en_ejecucion: 'badge-en-ejecucion',
      completado:   'badge-completado',
      cancelado:    'badge-cancelado',
    };
    return map[estado] ?? 'badge-generado';
  }

  formatPlazo(c: ContratoListItem): string {
    const l = this.translate.currentLang ?? 'fr';
    const sem = l === 'en' ? 'wks.' : 'sem.';
    if (c.plazo_semanas_min == null && c.plazo_semanas_max == null) return '—';
    if (c.plazo_semanas_min === c.plazo_semanas_max) return `${c.plazo_semanas_min} ${sem}`;
    return `${c.plazo_semanas_min ?? '?'} – ${c.plazo_semanas_max ?? '?'} ${sem}`;
  }

  formatFecha(valor: string | null): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CA', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    const parts  = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return this.translate.currentLang === 'en'
      ? `${p['month']} ${p['day']}, ${p['year']}`
      : `${p['day']} ${p['month']} ${p['year']}`;
  }

  formatPrecio(valor: number): string {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
    }).format(valor);
  }
}
