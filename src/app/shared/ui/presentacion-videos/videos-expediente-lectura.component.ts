import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PerfilVideoService } from '../../../services/perfil-video.service';
import { DbPerfilVideo } from '../../../types/supabase';
import { VideoFichaComponent } from './video-ficha.component';

/**
 * Videos con los que otras personas se presentan en un expediente, sólo para
 * verlos: ni cambiarlos, ni quitarlos, ni renombrarlos. Cada uno es una
 * `app-video-ficha`; aquí se cargan y se cubren la carga, el error y el vacío.
 *
 * Quién sale lo decide RLS: al constructor, los del estimador del expediente
 * (nunca los de otros constructores). Los propios de `perfilId` no se listan;
 * ésos van en `app-video-expediente`.
 */
@Component({
    selector: 'app-videos-expediente-lectura',
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [TranslatePipe, VideoFichaComponent],
    templateUrl: './videos-expediente-lectura.component.html',
    styleUrls: ['./video-slot.css', './videos-expediente-lectura.component.css']
})
export class VideosExpedienteLecturaComponent implements OnInit {
  private readonly service = inject(PerfilVideoService);

  readonly expedienteId = input.required<string>();
  /** Quien mira: sus propios videos no salen aquí. */
  readonly perfilId     = input.required<string>();
  /** Clave del texto de ayuda (opcional); sólo sale si hay videos. */
  readonly ayuda        = input('');
  /** Clave del texto cuando no hay videos. */
  readonly vacio        = input('expediente_video.others_empty');

  readonly videos     = signal<DbPerfilVideo[]>([]);
  readonly miniaturas = signal<Record<string, string>>({});
  readonly cargando   = signal(true);
  readonly errorCarga = signal(false);

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.errorCarga.set(false);
    try {
      const videos = await this.service.ajenosDeExpediente(this.expedienteId(), this.perfilId());
      this.videos.set(videos);
      this.miniaturas.set(await this.service.urlsMiniaturas(videos).catch(() => ({})));
    } catch (e) {
      console.error('[VideosExpedienteLectura] cargar:', e);
      this.errorCarga.set(true);
    } finally {
      this.cargando.set(false);
    }
  }
}
