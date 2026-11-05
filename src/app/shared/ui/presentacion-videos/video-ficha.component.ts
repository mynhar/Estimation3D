import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { LangService } from '../../../services/lang.service';
import { DbPerfilVideo } from '../../../types/supabase';
import { ReproductorVideoComponent } from './reproductor-video.component';
import { formatoDuracion, formatoRelativo } from './grabacion';

/**
 * Un video de presentación de otra persona, sólo para verlo: miniatura,
 * título y, al pulsar, el reproductor sin edición ni acciones.
 *
 * `compacta` lo reduce a una fila (miniatura pequeña + título) para tarjetas
 * estrechas, como las de cada oferta.
 */
@Component({
  selector: 'app-video-ficha',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe, ReproductorVideoComponent],
  templateUrl: './video-ficha.component.html',
  styleUrls: ['./video-slot.css', './video-ficha.component.css'],
})
export class VideoFichaComponent {
  private readonly lang = inject(LangService);

  readonly video     = input.required<DbPerfilVideo>();
  /** URL firmada de la miniatura; sin ella (o si no se pudo firmar), un icono. */
  readonly miniatura = input<string | null | undefined>(null);
  readonly compacta  = input(false);
  /** Clave del rótulo sobre el título (opcional). */
  readonly etiqueta  = input('');
  /** Quién se presenta, bajo el título de la fila compacta (opcional). */
  readonly autor     = input('');

  readonly abierto = signal<DbPerfilVideo | null>(null);

  readonly duracion = computed(() => formatoDuracion(this.video().duracion_ms));
  readonly relativo = computed(() => formatoRelativo(this.video().creado_en, this.lang.current()));
  readonly origen   = computed(() => {
    const v = this.video();
    return v.modo ? `presentation_videos.mode.${v.modo}` : `presentation_videos.origin.${v.origen}`;
  });

  abrir(): void {
    this.abierto.set(this.video());
  }
}
