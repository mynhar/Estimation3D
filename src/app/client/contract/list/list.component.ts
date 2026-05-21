import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ContratoService } from '../../../services/contrato.service';
import { ContratoListItem } from '../../../models';

@Component({
  selector: 'app-contract-list',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './list.component.html',
  styleUrl: './list.component.css',
})
export class ContractListComponent implements OnInit {
  private auth            = inject(AuthSupabaseService);
  private contratoService = inject(ContratoService);
  private translate       = inject(TranslateService);
  private router          = inject(Router);

  user      = toSignal(this.auth.user$);
  contratos = signal<ContratoListItem[]>([]);
  cargando  = signal(true);

  descargando = signal<string | null>(null);

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

  servicioNombre(c: ContratoListItem): string {
    const lang = this.translate.currentLang;
    if (lang === 'en') return c.servicio_nombre_en || c.servicio_nombre;
    if (lang === 'fr') return c.servicio_nombre_fr || c.servicio_nombre;
    return c.servicio_nombre;
  }

  estadoBadge(estado: string): string {
    const map: Record<string, string> = {
      generado: 'badge-generado',
      firmado:  'badge-firmado',
    };
    return map[estado] ?? 'badge-generado';
  }

  descargarPdf(c: ContratoListItem) {
    if (this.descargando()) return;
    this.descargando.set(c.id);
    try {
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

      const blob = this.contratoService.generarPdfBlob({
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

      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
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

  formatPrecio(valor: number): string {
    return new Intl.NumberFormat('fr-CA', {
      style: 'currency', currency: 'CAD', maximumFractionDigits: 0,
    }).format(valor);
  }
}
