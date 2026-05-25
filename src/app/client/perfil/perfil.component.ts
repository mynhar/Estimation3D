import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';
import { FILE_LIMITS, validateFile } from '../../shared/validators/file.validator';

interface PerfilRow {
  nombre:    string;
  apellido:  string;
  telefono:  string | null;
  rol:       string;
  avatar_url: string | null;
  proveedor: string | null;
}

const ROL_BADGE_CLASS: Record<string, string> = {
  cliente:       'role-badge role-badge--cliente',
  estimador:     'role-badge role-badge--estimador',
  constructor:   'role-badge role-badge--constructor',
  administrador: 'role-badge role-badge--administrador',
};

const FALLBACK = 'assets/avatar-fallback.jpg';
const BUCKET   = 'archivos';

@Component({
  selector: 'app-perfil',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css',
})
export class PerfilComponent implements OnInit {
  private auth      = inject(AuthSupabaseService);
  private translate = inject(TranslateService);

  user = toSignal(this.auth.user$);

  perfil          = signal<PerfilRow | null>(null);
  cargando        = signal(true);
  guardando       = signal(false);
  subiendoAvatar  = signal(false);
  previewUrl      = signal<string | null>(null);
  exitoMsg        = signal('');
  errorMsg        = signal('');

  nombre   = signal('');
  apellido = signal('');
  telefono = signal('');

  hasCambios = computed(() => {
    const p = this.perfil();
    if (!p) return false;
    return this.nombre()   !== (p.nombre   ?? '')
        || this.apellido() !== (p.apellido ?? '')
        || this.telefono() !== (p.telefono ?? '');
  });

  get esProveedorEmail(): boolean {
    return this.perfil()?.proveedor === 'email';
  }

  get avatarSrc(): string {
    return this.previewUrl()
        ?? this.perfil()?.avatar_url
        ?? this.user()?.user_metadata?.['avatar_url']
        ?? FALLBACK;
  }

  async ngOnInit() {
    const userId = this.user()?.id;
    if (!userId) return;

    try {
      const { data, error } = await this.auth.client
        .from('perfil')
        .select('nombre, apellido, telefono, rol, avatar_url, proveedor')
        .eq('id', userId)
        .single();

      if (error) throw error;

      this.perfil.set(data);
      this.nombre.set(data.nombre   ?? '');
      this.apellido.set(data.apellido ?? '');
      this.telefono.set(data.telefono ?? '');
    } catch (e: any) {
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  async onAvatarChange(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const fileErr = validateFile(file, FILE_LIMITS.AVATAR.maxBytes, FILE_LIMITS.AVATAR.types);
    if (fileErr) {
      this.errorMsg.set(fileErr === 'validation.file_type' ? 'validation.avatar_type' : 'profile.avatar_size_error');
      return;
    }

    const userId = this.user()?.id;
    if (!userId) return;

    this.previewUrl.set(URL.createObjectURL(file));
    this.subiendoAvatar.set(true);
    this.exitoMsg.set('');
    this.errorMsg.set('');

    try {
      const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const path = `avatares/${userId}.${ext}`;

      const { error: uploadError } = await this.auth.client.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type, upsert: true });

      if (uploadError) throw uploadError;

      const publicUrl = this.auth.client.storage
        .from(BUCKET)
        .getPublicUrl(path).data.publicUrl;

      const freshUrl = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await this.auth.client
        .from('perfil')
        .update({ avatar_url: freshUrl })
        .eq('id', userId);

      if (updateError) throw updateError;

      this.perfil.update(p => p ? { ...p, avatar_url: freshUrl } : p);
      this.previewUrl.set(null);
      this.auth.notificarEdicionAvatar(freshUrl);

      this.exitoMsg.set('profile.avatar_updated');
      setTimeout(() => this.exitoMsg.set(''), 4000);
    } catch (e: any) {
      this.previewUrl.set(null);
      this.errorMsg.set(e.message ?? 'Error al subir la imagen.');
    } finally {
      this.subiendoAvatar.set(false);
    }
  }

  async guardar() {
    const userId = this.user()?.id;
    if (!userId || !this.hasCambios()) return;

    this.guardando.set(true);
    this.exitoMsg.set('');
    this.errorMsg.set('');

    try {
      const { error } = await this.auth.client
        .from('perfil')
        .update({
          nombre:   this.nombre().trim(),
          apellido: this.apellido().trim(),
          telefono: this.telefono().trim(),
        })
        .eq('id', userId);

      if (error) throw error;

      this.perfil.update(p =>
        p ? { ...p,
              nombre:   this.nombre().trim(),
              apellido: this.apellido().trim(),
              telefono: this.telefono().trim() }
          : p
      );
      this.nombre.set(this.nombre().trim());
      this.apellido.set(this.apellido().trim());
      this.telefono.set(this.telefono().trim());

      this.auth.notificarEdicionPerfil(this.nombre().trim(), this.apellido().trim());
      this.exitoMsg.set('profile.saved');
      setTimeout(() => this.exitoMsg.set(''), 4000);
    } catch (e: any) {
      this.errorMsg.set(e.message);
    } finally {
      this.guardando.set(false);
    }
  }

  resetForm() {
    const p = this.perfil();
    if (!p) return;
    this.nombre.set(p.nombre   ?? '');
    this.apellido.set(p.apellido ?? '');
    this.telefono.set(p.telefono ?? '');
    this.exitoMsg.set('');
    this.errorMsg.set('');
  }

  rolLabel(rol: string): string { return 'role.' + rol; }

  rolBadgeClass(rol: string): string {
    return ROL_BADGE_CLASS[rol] ?? 'role-badge role-badge--cliente';
  }

  get displayName(): string {
    const p = this.perfil();
    if (p?.nombre || p?.apellido) return `${p?.nombre ?? ''} ${p?.apellido ?? ''}`.trim();
    return this.user()?.user_metadata?.['full_name'] || this.user()?.email || '';
  }

  get memberSince(): string {
    const created = this.user()?.created_at;
    if (!created) return '';
    const raw = created.includes('T') ? created.split('T')[0] : created;
    const d   = new Date(`${raw}T00:00:00`);
    if (isNaN(d.getTime())) return '';
    const localeMap: Record<string, string> = { es: 'es-CR', en: 'en-US', fr: 'fr-CA' };
    const locale = localeMap[this.translate.currentLang] ?? 'fr-CA';
    const parts  = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).formatToParts(d);
    const p: Record<string, string> = {};
    for (const part of parts) p[part.type] = part.value;
    return this.translate.currentLang === 'en'
      ? `${p['month']} ${p['day']}, ${p['year']}`
      : `${p['day']} ${p['month']} ${p['year']}`;
  }
}
