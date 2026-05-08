import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { AuthSupabaseService } from '../../services/auth-supabase.service';

interface PerfilRow {
  nombre:    string;
  apellido:  string;
  telefono:  string;
  rol:       string;
  avatar_url: string | null;
  proveedor: string | null;
}

const ROL_LABEL: Record<string, string> = {
  cliente:       'Cliente',
  estimador:     'Estimador',
  constructor:   'Constructor',
  administrador: 'Administrador',
};

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

@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.css',
})
export class PerfilComponent implements OnInit {
  private auth = inject(AuthSupabaseService);

  user = toSignal(this.auth.user$);

  perfil    = signal<PerfilRow | null>(null);
  cargando  = signal(true);
  guardando = signal(false);
  exitoMsg  = signal('');
  errorMsg  = signal('');

  // Campos como signals para detectar cambios
  nombre   = signal('');
  apellido = signal('');
  telefono = signal('');

  // Habilitado solo cuando hay cambios respecto a los datos guardados
  hasCambios = computed(() => {
    const p = this.perfil();
    if (!p) return false;
    return this.nombre()   !== (p.nombre   ?? '')
        || this.apellido() !== (p.apellido ?? '')
        || this.telefono() !== (p.telefono ?? '');
  });

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
      // Sincronizar signals con los valores guardados (sin trim visual)
      this.nombre.set(this.nombre().trim());
      this.apellido.set(this.apellido().trim());
      this.telefono.set(this.telefono().trim());

      this.exitoMsg.set('Perfil actualizado correctamente.');
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

  rolLabel(rol: string): string { return ROL_LABEL[rol] ?? rol; }
  rolBadge(rol: string): string { return ROL_BADGE[rol] ?? 'bg-secondary'; }
  rolRing(rol: string):  string { return ROL_RING[rol]  ?? '#adb5bd'; }

  get avatarUrl(): string {
    return this.user()?.user_metadata?.['avatar_url'] || 'assets/avatar-fallback.jpg';
  }

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
