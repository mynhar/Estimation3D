import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
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
  rol          = signal<string>('cliente');

  // Eyebrow / tagline / intro adaptados al rol.
  eyebrowKey   = computed(() => `role.${this.rol()}`);
  taglineKey   = computed(() => `ai_assistant.tagline_${this.rol()}`);
  introLeadKey = computed(() => `ai_assistant.intro_lead_${this.rol()}`);

  // Preguntas frecuentes sugeridas (claves i18n) según el rol.
  private readonly FAQS_POR_ROL: Record<string, string[]> = {
    cliente: [
      'ai_assistant.faq_recomienda',
      'ai_assistant.faq_riesgos',
      'ai_assistant.faq_fin',
      'ai_assistant.faq_ahorro',
      'ai_assistant.faq_rechazo',
      'ai_assistant.faq_garantia',
    ],
    estimador: [
      'ai_assistant.faq_est_diagnostico',
      'ai_assistant.faq_est_partidas',
      'ai_assistant.faq_est_medicion',
      'ai_assistant.faq_est_riesgos',
      'ai_assistant.faq_est_adjuntos',
    ],
    constructor: [
      'ai_assistant.faq_con_alcance',
      'ai_assistant.faq_con_oferta',
      'ai_assistant.faq_con_plazo',
      'ai_assistant.faq_con_riesgos',
      'ai_assistant.faq_con_adjuntos',
    ],
    administrador: [
      'ai_assistant.faq_adm_resumen',
      'ai_assistant.faq_adm_estado',
      'ai_assistant.faq_adm_ofertas',
      'ai_assistant.faq_adm_cuellos',
      'ai_assistant.faq_adm_contrato',
    ],
  };
  faqs = computed(() => this.FAQS_POR_ROL[this.rol()] ?? this.FAQS_POR_ROL['cliente']);

  // Capacidades para el estado vacío (clave icono / título / descripción).
  readonly capacidades = [
    { icon: 'bi-clipboard-data', title: 'ai_assistant.cap_analiza_title',  desc: 'ai_assistant.cap_analiza_desc' },
    { icon: 'bi-translate',      title: 'ai_assistant.cap_jargon_title',   desc: 'ai_assistant.cap_jargon_desc' },
    { icon: 'bi-shield-check',   title: 'ai_assistant.cap_riesgos_title',  desc: 'ai_assistant.cap_riesgos_desc' },
    { icon: 'bi-signpost-split', title: 'ai_assistant.cap_decide_title',   desc: 'ai_assistant.cap_decide_desc' },
  ];

  constructor() {
    // Auto-scroll al final cuando cambian los mensajes o el estado de envío
    // (nueva pregunta, indicador de escritura y respuesta).
    effect(() => {
      this.mensajes();
      this.enviando();
      // Doble rAF: espera a que Angular pinte la nueva burbuja y el layout se
      // recalcule antes de medir scrollHeight; con queueMicrotask la altura aún
      // estaba desactualizada y no bajaba hasta el final.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => this.scrollAlFondo()),
      );
    });
  }

  /** Lleva el scroll del chat al final (última pregunta / respuesta). */
  private scrollAlFondo(): void {
    const el = this.scrollRef()?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  async ngOnInit(): Promise<void> {
    const userId = this.user()?.id;
    if (!userId) { this.cargando.set(false); return; }
    try {
      const { data: perfil } = await this.auth.client
        .from('perfil').select('rol').eq('id', userId).single();
      const rol = perfil?.rol ?? 'cliente';
      this.rol.set(rol);

      const exps = await this.cargarExpedientesPorRol(rol, userId);
      this.expedientes.set(exps);
      const primero = exps[0]?.id ?? null;
      this.seleccionado.set(primero);
      if (primero) await this.cargarConversacion(primero);
    } finally {
      this.cargando.set(false);
    }
  }

  /** Expedientes que cada rol puede consultar con el asistente. */
  private async cargarExpedientesPorRol(rol: string, userId: string): Promise<ExpedienteOpcion[]> {
    const raw =
      rol === 'estimador'     ? await this.expRepo.findByFiltro({ estimadorId: userId }) :
      rol === 'constructor'   ? await this.expRepo.findDisponibles() :
      rol === 'administrador' ? await this.expRepo.findAll() :
                                await this.expRepo.findByClienteId(userId);
    return raw.map(e => ({ id: e.id, numero: e.numero, estado: e.estado }));
  }

  // ── Selección de expediente ──────────────────────────────────────────────
  cambiarExpediente(id: string): void {
    if (id === this.seleccionado()) return;
    this.seleccionado.set(id);
    this.borrador.set('');
    this.mensajes.set([]);                 // el contexto cambia → cargar su historial
    void this.cargarConversacion(id);
  }

  /** Carga el historial persistido del expediente en la conversación. */
  private async cargarConversacion(expId: string): Promise<void> {
    try {
      const historial = await this.asistente.cargarHistorial(expId);
      // Evita carreras si el usuario cambió de expediente mientras cargaba.
      if (this.seleccionado() === expId) this.mensajes.set(historial);
    } catch {
      // Silencioso: si falla la carga, se deja la conversación vacía.
    }
  }

  /** Borra la conversación persistida del expediente activo. */
  async limpiarConversacion(): Promise<void> {
    const expId = this.seleccionado();
    if (!expId || this.enviando() || !this.hayConversacion) return;
    try {
      await this.asistente.limpiarHistorial(expId);
      this.mensajes.set([]);
    } catch {
      this.mensajes.update(m => [...m, { role: 'error', content: this.translate.instant('ai_assistant.error') }]);
    }
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
