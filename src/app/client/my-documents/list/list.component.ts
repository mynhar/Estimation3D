import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../../services/auth-supabase.service';
import { ArchivoService } from '../../../services/archivo.service';
import { ToastService } from '../../../services/toast.service';
import {
  DocumentosClienteService,
  ExpedienteArchivosVM,
  GrupoRolVM,
  ArchivoVM,
  RolSubida,
  TipoArchivo,
} from '../../../services/documentos-cliente.service';

type FiltroTipo = 'todos' | TipoArchivo;

@Component({
  selector: 'app-client-my-documents-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, NgTemplateOutlet],
  templateUrl: './list.component.html',
  styleUrl: './list.component.css',
})
export class MyDocumentsListComponent implements OnInit {
  private auth        = inject(AuthSupabaseService);
  private documentos  = inject(DocumentosClienteService);
  private archivoSvc  = inject(ArchivoService);
  private toast       = inject(ToastService);
  private translate   = inject(TranslateService);

  private user = toSignal(this.auth.user$);

  expedientes = signal<ExpedienteArchivosVM[]>([]);
  cargando    = signal(true);
  error       = signal<string | null>(null);

  expandidos  = signal<Set<string>>(new Set());
  filtroTipo  = signal<FiltroTipo>('todos');
  vista       = signal<'lista' | 'galeria'>('lista');
  thumbRoto   = signal<Set<string>>(new Set());

  subiendoId        = signal<string | null>(null);   // expediente en subida
  dragId            = signal<string | null>(null);    // expediente con drag encima
  eliminandoId      = signal<string | null>(null);
  confirmEliminarId = signal<string | null>(null);
  fotoAmpliada      = signal<string | null>(null);

  private pendingExpId: string | null = null;

  // Conteo global por tipo, para las pills de filtro y la franja de resumen.
  conteoGlobal = computed(() => {
    const exps = this.expedientes();
    const all  = exps.flatMap(e => e.grupos.flatMap(g => g.archivos));
    return {
      todos:       all.length,
      foto:        all.filter(a => a.tipo === 'foto').length,
      video:       all.filter(a => a.tipo === 'video').length,
      documento:   all.filter(a => a.tipo === 'documento').length,
      expedientes: exps.length,
    };
  });

  // ── Ciclo de vida ───────────────────────────────────────────────────────────

  async ngOnInit(): Promise<void> {
    await this.cargar(true);
  }

  private async cargar(mostrarSpinner: boolean): Promise<void> {
    const userId = this.user()?.id;
    if (!userId) { this.cargando.set(false); return; }
    if (mostrarSpinner) this.cargando.set(true);
    try {
      const data = await this.documentos.getExpedientesConArchivos(userId);
      this.expedientes.set(data);
      // Colapsar por defecto; abrir solo el expediente más reciente.
      if (mostrarSpinner) {
        this.expandidos.set(new Set(data.length ? [data[0].expedienteId] : []));
      }
      this.error.set(null);
    } catch (e: unknown) {
      this.error.set(e instanceof Error ? e.message : String(e));
    } finally {
      if (mostrarSpinner) this.cargando.set(false);
    }
  }

  // ── Acordeón ──────────────────────────────────────────────────────────────

  toggle(expId: string): void {
    this.expandidos.update(set => {
      const next = new Set(set);
      next.has(expId) ? next.delete(expId) : next.add(expId);
      return next;
    });
  }
  isExpandido(expId: string): boolean { return this.expandidos().has(expId); }

  // ── Filtro por tipo ─────────────────────────────────────────────────────────

  setFiltro(t: FiltroTipo): void { this.filtroTipo.set(t); }
  setVista(v: 'lista' | 'galeria'): void { this.vista.set(v); }

  // ¿Tiene miniatura real? (solo fotos en storage, no enlaces externos ni rotas)
  tieneThumb(a: ArchivoVM): boolean {
    return a.tipo === 'foto' && !a.esExterno && !this.thumbRoto().has(a.id);
  }
  onThumbError(id: string): void {
    this.thumbRoto.update(s => { const n = new Set(s); n.add(id); return n; });
  }

  // Grupos del expediente con sus archivos ya filtrados por tipo (omite vacíos).
  gruposVisibles(exp: ExpedienteArchivosVM): GrupoRolVM[] {
    const f = this.filtroTipo();
    if (f === 'todos') return exp.grupos;
    return exp.grupos
      .map(g => ({ rol: g.rol, archivos: g.archivos.filter(a => a.tipo === f) }))
      .filter(g => g.archivos.length > 0);
  }

  visiblesEn(exp: ExpedienteArchivosVM): number {
    const f = this.filtroTipo();
    if (f === 'todos') return exp.total;
    return exp.grupos.reduce((n, g) => n + g.archivos.filter(a => a.tipo === f).length, 0);
  }

  // ── Subir (zona drag&drop + clic; tipo inferido del MIME) ───────────────────

  pedirArchivos(expId: string, input: HTMLInputElement): void {
    if (this.subiendoId()) return;
    this.pendingExpId = expId;
    input.value = '';
    input.click();
  }

  async onArchivosElegidos(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = input.files ? Array.from(input.files) : [];
    const expId = this.pendingExpId;
    this.pendingExpId = null;
    if (expId && files.length) await this.subirVarios(expId, files);
    input.value = '';
  }

  onDragOver(expId: string, e: DragEvent): void {
    e.preventDefault();
    if (!this.subiendoId()) this.dragId.set(expId);
  }
  onDragLeave(expId: string): void { if (this.dragId() === expId) this.dragId.set(null); }
  async onDrop(expId: string, e: DragEvent): Promise<void> {
    e.preventDefault();
    this.dragId.set(null);
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length) await this.subirVarios(expId, files);
  }

  private async subirVarios(expId: string, files: File[]): Promise<void> {
    const uid = this.user()?.id;
    if (!uid || this.subiendoId()) return;
    this.subiendoId.set(expId);
    try {
      for (const f of files) {
        await this.archivoSvc.subir(expId, this.tipoDeMime(f), f, uid);
      }
      await this.cargar(false);
      this.toast.show(this.translate.instant('my_documents.success_upload'), 'success');
    } catch {
      this.toast.show(this.translate.instant('my_documents.err_upload'), 'danger');
    } finally {
      this.subiendoId.set(null);
    }
  }

  private tipoDeMime(f: File): TipoArchivo {
    if (f.type.startsWith('image/')) return 'foto';
    if (f.type.startsWith('video/')) return 'video';
    return 'documento';
  }

  // ── Eliminar (solo propios; RLS bloquea el resto) ───────────────────────────

  pedirEliminar(id: string): void { this.confirmEliminarId.set(id); }
  cancelarEliminar(): void { this.confirmEliminarId.set(null); }

  async eliminar(a: ArchivoVM): Promise<void> {
    if (this.eliminandoId()) return;
    this.eliminandoId.set(a.id);
    try {
      await this.archivoSvc.eliminar({
        id:             a.id,
        nombre_archivo: a.nombre,
        url_storage:    a.urlStorage,
        mime_type:      a.mimeType,
        tamano_bytes:   a.tamanoBytes,
        subido_por:     a.subidoPor ?? undefined,
      });
      this.confirmEliminarId.set(null);
      await this.cargar(false);
      this.toast.show(this.translate.instant('my_documents.success_delete'), 'success');
    } catch {
      this.toast.show(this.translate.instant('my_documents.err_delete'), 'danger');
    } finally {
      this.eliminandoId.set(null);
    }
  }

  // ── Ver / descargar ─────────────────────────────────────────────────────────

  ver(a: ArchivoVM): void {
    if (a.tipo === 'foto' && !a.esExterno) {
      this.fotoAmpliada.set(a.url);
    } else {
      window.open(a.url, '_blank', 'noopener');
    }
  }
  cerrarFoto(): void { this.fotoAmpliada.set(null); }

  descargar(a: ArchivoVM): void {
    const el = document.createElement('a');
    el.href = a.url;
    el.download = a.nombre;
    el.target = '_blank';
    el.rel = 'noopener';
    document.body.appendChild(el);
    el.click();
    document.body.removeChild(el);
  }

  // ── Helpers de presentación ─────────────────────────────────────────────────

  iconoTipo(tipo: TipoArchivo): string {
    if (tipo === 'foto')  return 'bi-image';
    if (tipo === 'video') return 'bi-camera-video';
    return 'bi-file-earmark-text';
  }

  labelRol(rol: RolSubida): string { return `my_documents.role_${rol}`; }

  iconoRol(rol: RolSubida): string {
    if (rol === 'cliente')       return 'bi-person';
    if (rol === 'estimador')     return 'bi-clipboard-check';
    if (rol === 'constructor')   return 'bi-tools';
    if (rol === 'administrador') return 'bi-shield-check';
    return 'bi-question-circle';
  }

  formatTamano(bytes: number): string {
    if (!bytes || bytes <= 0) return '—';
    if (bytes < 1024)         return `${bytes} o`;
    const kb = bytes / 1024;
    if (kb < 1024) return `${Math.round(kb)} Ko`;
    return `${(kb / 1024).toFixed(1)} Mo`;
  }
}
