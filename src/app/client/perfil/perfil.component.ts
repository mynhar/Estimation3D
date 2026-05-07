import { Component, OnInit, inject, signal } from '@angular/core';
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

  nombre   = '';
  apellido = '';
  telefono = '';

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
      this.nombre   = data.nombre   ?? '';
      this.apellido = data.apellido ?? '';
      this.telefono = data.telefono ?? '';
    } catch (e: any) {
      this.errorMsg.set(e.message);
    } finally {
      this.cargando.set(false);
    }
  }

  async guardar() {
    const userId = this.user()?.id;
    if (!userId) return;

    this.guardando.set(true);
    this.exitoMsg.set('');
    this.errorMsg.set('');

    try {
      const { error } = await this.auth.client
        .from('perfil')
        .update({
          nombre:   this.nombre.trim(),
          apellido: this.apellido.trim(),
          telefono: this.telefono.trim(),
        })
        .eq('id', userId);

      if (error) throw error;

      this.perfil.update(p =>
        p ? { ...p, nombre: this.nombre.trim(), apellido: this.apellido.trim(), telefono: this.telefono.trim() } : p
      );
      this.exitoMsg.set('Perfil actualizado correctamente.');
    } catch (e: any) {
      this.errorMsg.set(e.message);
    } finally {
      this.guardando.set(false);
    }
  }

  rolLabel(rol: string): string { return ROL_LABEL[rol] ?? rol; }
  rolBadge(rol: string): string { return ROL_BADGE[rol] ?? 'bg-secondary'; }

  get avatarUrl(): string {
    return this.user()?.user_metadata?.['avatar_url'] || 'assets/avatar-fallback.jpg';
  }

  get displayName(): string {
    const p = this.perfil();
    if (p?.nombre || p?.apellido) return `${p?.nombre ?? ''} ${p?.apellido ?? ''}`.trim();
    return this.user()?.user_metadata?.['full_name'] || this.user()?.email || '';
  }
}
