import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ContratoService } from '../../../services/contrato.service';
import { ToastService } from '../../../services/toast.service';
import { ContratoListItem } from '../../../models';

@Component({
  selector: 'app-contract-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
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

  descargando   = signal<string | null>(null);
  firmandoId    = signal<string | null>(null);
  confirmandoId = signal<string | null>(null);
  aceptado      = signal(false);

  // ── PDF viewer ────────────────────────────────────────────────────────────
  pdfVistaId  = signal<string | null>(null);
  pdfBlobUrl  = signal<string | null>(null);

  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) { this.router.navigate(['/login']); return; }
    try {
      this.contratos.set(await this.contratoService.getMisContratos(userId));
    } catch (e: any) {
      console.error('[ContractList]', e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Firma ─────────────────────────────────────────────────────────────────

  abrirPanelFirma(id: string): void {
    this.confirmandoId.set(id);
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
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-CA', fr: 'fr-CA' };
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

  servicioNombre(c: ContratoListItem): string {
    const lang = this.translate.currentLang;
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
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
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
