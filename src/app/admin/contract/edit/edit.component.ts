import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ContratoService } from '../../../services/contrato.service';
import { ContratoAdminDetalle, ContratoPdfData } from '../../../models';

type LangPdf = 'es' | 'en' | 'fr';

@Component({
  selector: 'app-admin-contract-edit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './edit.component.html',
  styleUrl: './edit.component.css',
})
export class AdminContractEditComponent implements OnInit, OnDestroy {
  private route           = inject(ActivatedRoute);
  private router          = inject(Router);
  private sanitizer       = inject(DomSanitizer);
  private translate       = inject(TranslateService);
  private contratoService = inject(ContratoService);

  contrato      = signal<ContratoAdminDetalle | null>(null);
  cargando      = signal(true);
  error         = signal<string | null>(null);

  cancelando          = signal(false);
  confirmandoCancelar = signal(false);
  errorCancelar       = signal<string | null>(null);

  firmando          = signal(false);
  confirmandoFirmar = signal(false);
  errorFirmar       = signal<string | null>(null);

  ejecutando          = signal(false);
  confirmandoEjecutar = signal(false);
  errorEjecutar       = signal<string | null>(null);

  completando          = signal(false);
  confirmandoCompletar = signal(false);
  errorCompletar       = signal<string | null>(null);

  generandoPdf  = signal(false);
  pdfUrl        = signal<SafeResourceUrl | null>(null);
  /** 'oculto' = sólo header; 'normal' = iframe a altura media; 'grande' = iframe alto */
  pdfTamano     = signal<'oculto' | 'normal' | 'grande'>('normal');
  langPdf       = signal<LangPdf>('fr');

  readonly LANGS: LangPdf[] = ['es', 'en', 'fr'];
  private rawBlobUrl: string | null = null;

  async ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) { this.router.navigate(['/admin/contract']); return; }

    try {
      const data = await this.contratoService.getContratoAdminById(id);
      this.contrato.set(data);
    } catch (e: any) {
      this.error.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  ngOnDestroy() {
    this.revokeBlobUrl();
  }

  private revokeBlobUrl() {
    if (this.rawBlobUrl) {
      URL.revokeObjectURL(this.rawBlobUrl);
      this.rawBlobUrl = null;
    }
  }

  volver() {
    this.router.navigate(['/admin/contract']);
  }

  get puedeCancel(): boolean {
    const estado = this.contrato()?.estado ?? '';
    return estado !== 'cancelado';
  }

  get puedeFirmar(): boolean {
    return this.contrato()?.estado === 'generado';
  }

  get puedeEjecutar(): boolean {
    return this.contrato()?.estado === 'firmado';
  }

  get puedeCompletar(): boolean {
    return this.contrato()?.estado === 'en_ejecucion';
  }

  iniciarCancelar() {
    this.confirmandoCancelar.set(true);
    this.errorCancelar.set(null);
  }

  cancelarConfirmacion() {
    this.confirmandoCancelar.set(false);
    this.errorCancelar.set(null);
  }

  async confirmarCancelar() {
    const c = this.contrato();
    if (!c || this.cancelando()) return;
    this.cancelando.set(true);
    this.errorCancelar.set(null);
    try {
      await this.contratoService.cancelarContratoAdmin(c.id);
      // Recargar el contrato para reflejar el nuevo estado
      const actualizado = await this.contratoService.getContratoAdminById(c.id);
      this.contrato.set(actualizado);
      this.confirmandoCancelar.set(false);
    } catch (e: any) {
      this.errorCancelar.set(e.message);
    } finally {
      this.cancelando.set(false);
    }
  }

  iniciarFirmar() {
    this.confirmandoFirmar.set(true);
    this.errorFirmar.set(null);
  }

  cancelarFirmacion() {
    this.confirmandoFirmar.set(false);
    this.errorFirmar.set(null);
  }

  iniciarEjecutar() {
    this.confirmandoEjecutar.set(true);
    this.errorEjecutar.set(null);
  }

  cancelarEjecucion() {
    this.confirmandoEjecutar.set(false);
    this.errorEjecutar.set(null);
  }

  iniciarCompletar() {
    this.confirmandoCompletar.set(true);
    this.errorCompletar.set(null);
  }

  cancelarCompletacion() {
    this.confirmandoCompletar.set(false);
    this.errorCompletar.set(null);
  }

  async confirmarCompletar() {
    const c = this.contrato();
    if (!c || this.completando()) return;
    this.completando.set(true);
    this.errorCompletar.set(null);
    try {
      await this.contratoService.completarContratoAdmin(c.id);
      const actualizado = await this.contratoService.getContratoAdminById(c.id);
      this.contrato.set(actualizado);
      this.confirmandoCompletar.set(false);
    } catch (e: any) {
      this.errorCompletar.set(e.message);
    } finally {
      this.completando.set(false);
    }
  }

  async confirmarEjecutar() {
    const c = this.contrato();
    if (!c || this.ejecutando()) return;
    this.ejecutando.set(true);
    this.errorEjecutar.set(null);
    try {
      await this.contratoService.iniciarEjecucionContratoAdmin(c.id);
      const actualizado = await this.contratoService.getContratoAdminById(c.id);
      this.contrato.set(actualizado);
      this.confirmandoEjecutar.set(false);
    } catch (e: any) {
      this.errorEjecutar.set(e.message);
    } finally {
      this.ejecutando.set(false);
    }
  }

  async confirmarFirmar() {
    const c = this.contrato();
    if (!c || this.firmando()) return;
    this.firmando.set(true);
    this.errorFirmar.set(null);
    try {
      await this.contratoService.firmarContratoAdmin(c.id);
      const actualizado = await this.contratoService.getContratoAdminById(c.id);
      this.contrato.set(actualizado);
      this.confirmandoFirmar.set(false);
    } catch (e: any) {
      this.errorFirmar.set(e.message);
    } finally {
      this.firmando.set(false);
    }
  }

  async verPdf(lang: LangPdf) {
    const c = this.contrato();
    if (!c) return;
    this.generandoPdf.set(true);
    this.langPdf.set(lang);
    try {
      const localeMap: Record<LangPdf, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
      const locale   = localeMap[lang];
      const fechaGen = c.generado_en
        ? new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' })
            .format(new Date(c.generado_en.includes('T') ? c.generado_en : `${c.generado_en}T00:00:00`))
        : '';

      const svcNombre = lang === 'en' ? (c.servicio_nombre_en || c.servicio_nombre)
                      : lang === 'fr' ? (c.servicio_nombre_fr || c.servicio_nombre)
                      : c.servicio_nombre;
      const svcDesc   = lang === 'en' ? (c.servicio_desc_en || c.servicio_desc)
                      : lang === 'fr' ? (c.servicio_desc_fr || c.servicio_desc)
                      : c.servicio_desc;

      const pdfData: ContratoPdfData = {
        contratoId:          c.id,
        expedienteNumero:    c.expediente_numero,
        fechaGenerado:       fechaGen,
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
        fechaInicio:         c.oferta_fecha_inicio ?? '',
        descripcionTrabajo:  c.descripcion_trabajo,
        lang,
      };

      const blob = this.contratoService.generarPdfBlob(pdfData);
      this.revokeBlobUrl();
      this.rawBlobUrl = URL.createObjectURL(blob);
      this.pdfUrl.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.rawBlobUrl));
      // Si estaba contraído, mostrarlo al generar
      if (this.pdfTamano() === 'oculto') this.pdfTamano.set('normal');
    } finally {
      this.generandoPdf.set(false);
    }
  }

  toggleVisibilidad() {
    this.pdfTamano.set(this.pdfTamano() === 'oculto' ? 'normal' : 'oculto');
  }

  toggleTamano() {
    this.pdfTamano.set(this.pdfTamano() === 'grande' ? 'normal' : 'grande');
  }

  servicioNombre(c: ContratoAdminDetalle): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return c.servicio_nombre_en || c.servicio_nombre;
    if (lang === 'fr') return c.servicio_nombre_fr || c.servicio_nombre;
    return c.servicio_nombre;
  }

  servicioDesc(c: ContratoAdminDetalle): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return c.servicio_desc_en || c.servicio_desc;
    if (lang === 'fr') return c.servicio_desc_fr || c.servicio_desc;
    return c.servicio_desc;
  }

  badgeExpediente(estado: string): string {
    const map: Record<string, string> = {
      adjudicado: 'badge-adjudicado',
      contratado: 'badge-contratado',
    };
    return map[estado] ?? 'badge-adjudicado';
  }

  badgeContrato(estado: string): string {
    const map: Record<string, string> = {
      generado:     'badge-contrato-generado',
      firmado:      'badge-contrato-firmado',
      en_ejecucion: 'badge-contrato-en-ejecucion',
      completado:   'badge-contrato-completado',
      cancelado:    'badge-contrato-cancelado',
    };
    return map[estado] ?? '';
  }

  formatFecha(valor: string | null): string {
    if (!valor) return '—';
    const raw = valor.includes('T') ? valor.split('T')[0] : valor;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '—';
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  }

  formatPrecio(precio: number | null): string {
    if (precio == null) return '—';
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
    }).format(precio);
  }

  formatPlazo(min: number | null, max: number | null): string {
    if (!min && !max) return '—';
    if (min === max) return `${min} sem.`;
    return `${min ?? '?'} – ${max ?? '?'} sem.`;
  }
}
