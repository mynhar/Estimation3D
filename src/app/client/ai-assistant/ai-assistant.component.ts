import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  effect,
  inject,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { ExpedienteRepository } from '../../data';
import {
  AsistenteIaService,
  ChatMensaje,
} from '../../services/asistente-ia.service';

interface ExpedienteOpcion {
  id:     string;
  numero: string;
  estado: string;
}

interface BurbujaError {
  role:    'error';
  content: string;
}

type Burbuja = ChatMensaje | BurbujaError;

@Component({
  selector: 'app-client-ai-assistant',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, FormsModule],
  templateUrl: './ai-assistant.component.html',
  styleUrl: './ai-assistant.component.css',
})
export class AiAssistantComponent implements OnInit {
  private auth      = inject(AuthSupabaseService);
  private expRepo   = inject(ExpedienteRepository);
  private asistente = inject(AsistenteIaService);
  private translate = inject(TranslateService);

  private user = toSignal(this.auth.user$);
  private scrollRef = viewChild<ElementRef<HTMLElement>>('scroller');

  expedientes  = signal<ExpedienteOpcion[]>([]);
  seleccionado = signal<string | null>(null);
  mensajes     = signal<Burbuja[]>([]);
  enviando     = signal(false);
  cargando     = signal(true);
  borrador     = signal('');

  // Preguntas frecuentes sugeridas (claves i18n).
  readonly faqs: readonly string[] = [
    'ai_assistant.faq_recomienda',
    'ai_assistant.faq_riesgos',
    'ai_assistant.faq_fin',
    'ai_assistant.faq_ahorro',
    'ai_assistant.faq_rechazo',
    'ai_assistant.faq_garantia',
  ];

  // Capacidades para el estado vacío (clave icono / título / descripción).
  readonly capacidades = [
    { icon: 'bi-clipboard-data', title: 'ai_assistant.cap_analiza_title',  desc: 'ai_assistant.cap_analiza_desc' },
    { icon: 'bi-translate',      title: 'ai_assistant.cap_jargon_title',   desc: 'ai_assistant.cap_jargon_desc' },
    { icon: 'bi-shield-check',   title: 'ai_assistant.cap_riesgos_title',  desc: 'ai_assistant.cap_riesgos_desc' },
    { icon: 'bi-signpost-split', title: 'ai_assistant.cap_decide_title',   desc: 'ai_assistant.cap_decide_desc' },
  ];

  constructor() {
    // Auto-scroll al fondo cuando cambian los mensajes o el estado de envío.
    effect(() => {
      this.mensajes();
      this.enviando();
      queueMicrotask(() => {
        const el = this.scrollRef()?.nativeElement;
        if (el) el.scrollTop = el.scrollHeight;
      });
    });
  }

  async ngOnInit(): Promise<void> {
    const userId = this.user()?.id;
    if (!userId) { this.cargando.set(false); return; }
    try {
      const exps = await this.expRepo.findByClienteId(userId);
      this.expedientes.set(exps.map(e => ({ id: e.id, numero: e.numero, estado: e.estado })));
      this.seleccionado.set(exps[0]?.id ?? null);
    } finally {
      this.cargando.set(false);
    }
  }

  // ── Selección de expediente ──────────────────────────────────────────────
  cambiarExpediente(id: string): void {
    if (id === this.seleccionado()) return;
    this.seleccionado.set(id);
    this.mensajes.set([]);          // el contexto cambia → nueva conversación
    this.borrador.set('');
  }

  get hayConversacion(): boolean {
    return this.mensajes().length > 0;
  }

  // ── Envío ─────────────────────────────────────────────────────────────────
  usarFaq(clave: string): void {
    this.enviar(this.translate.instant(clave));
  }

  enviarBorrador(): void {
    this.enviar(this.borrador());
  }

  async enviar(texto: string): Promise<void> {
    const pregunta = texto.trim();
    const expId = this.seleccionado();
    if (!pregunta || !expId || this.enviando()) return;

    this.borrador.set('');
    this.mensajes.update(m => [...m, { role: 'user', content: pregunta }]);
    this.enviando.set(true);

    // Historial real (sin burbujas de error) para enviar al modelo.
    const historial: ChatMensaje[] = this.mensajes()
      .filter((m): m is ChatMensaje => m.role === 'user' || m.role === 'assistant');

    try {
      const res = await this.asistente.preguntar(expId, historial, this.translate.currentLang);
      const reply = res.refusal
        ? this.translate.instant('ai_assistant.refusal')
        : (res.reply ?? this.translate.instant('ai_assistant.empty_reply'));
      this.mensajes.update(m => [...m, { role: 'assistant', content: reply }]);
    } catch {
      this.mensajes.update(m => [...m, { role: 'error', content: this.translate.instant('ai_assistant.error') }]);
    } finally {
      this.enviando.set(false);
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.enviarBorrador();
    }
  }
}
