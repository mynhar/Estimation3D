import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthSupabaseService } from '../../services/auth-supabase.service';

interface PerfilRow {
  nombre:    string;
  apellido:  string;
  telefono:  string | null;
  rol:       string;
  avatar_url: string | null;
  proveedor: string | null;
}

const ROL_BADGE: Record<string, string> = {
  cliente:       'bg-primary',
  estimador:     'bg-info text-dark',
  constructor:   'bg-warning text-dark',
  administrador: 'bg-danger',
};

const ROL_RING: Record<string, string> = {
  cliente:       '#0d6efd',
  estimador:     '#0dcaf0',
  constructor:   '#ffc107',
  administrador: '#dc3545',
};

const FALLBACK = 'assets/avatar-fallback.jpg';
const BUCKET   = 'archivos';

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [FormsModule, TranslatePipe],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css',
})
export class PerfilComponent implements OnInit {
  private auth = inject(AuthSupabaseService);

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

    if (file.size > 2 * 1024 * 1024) {
      this.errorMsg.set('profile.avatar_size_error');
      return;
    }

    const userId = this.user()?.id;
    if (!userId) return;

    // Vista previa inmediata
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

      // Añadir timestamp para evitar caché del navegador entre subidas
      const freshUrl = `${publicUrl}?t=${Date.now()}`;

      // Guardar URL con cache-buster en DB para que el refresh también funcione
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
  rolBadge(rol: string): string { return ROL_BADGE[rol] ?? 'bg-secondary'; }
  rolRing(rol: string):  string { return ROL_RING[rol]  ?? '#adb5bd'; }

  get displayName(): string {
    const p = this.perfil();
    if (p?.nombre || p?.apellido) return `${p?.nombre ?? ''} ${p?.apellido ?? ''}`.trim();
    return this.user()?.user_metadata?.['full_name'] || this.user()?.email || '';
  }

  get memberSince(): string {
    const created = this.user()?.created_at;
    if (!created) return '';
    return new Date(created).toLocaleDateString('es-CR', {
      day: '2-digit', month: 'long', year: 'numeric',
    });
  }
}
