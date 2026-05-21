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

  async descargarPdf(c: ContratoListItem) {
    if (!c.url_pdf || this.descargando()) return;
    this.descargando.set(c.id);
    try {
      const url = await this.contratoService.getSignedUrl(c.url_pdf, 300);
      window.open(url, '_blank');
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
