import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthSupabaseService } from '../services/auth-supabase.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="container mt-5">
      <div class="row justify-content-center">
        <div class="col-sm-10 col-md-6 col-lg-5">
          <div class="card shadow-sm">
            <div class="card-body p-4">

              <!-- Tabs -->
              <ul class="nav nav-tabs mb-4">
                <li class="nav-item">
                  <button class="nav-link" [class.active]="vista() === 'login'" (click)="cambiarVista('login')">
                    Iniciar sesión
                  </button>
                </li>
                <li class="nav-item">
                  <button class="nav-link" [class.active]="vista() === 'registro'" (click)="cambiarVista('registro')">
                    Registrarse
                  </button>
                </li>
              </ul>

              <!-- ===== VISTA LOGIN ===== -->
              @if (vista() === 'login') {
                <form [formGroup]="loginForm" (ngSubmit)="onLogin()">
                  <div class="mb-3">
                    <label class="form-label">Correo electrónico</label>
                    <input type="email" class="form-control" formControlName="email"
                      placeholder="correo@ejemplo.com" autocomplete="email" />
                  </div>
                  <div class="mb-3">
                    <label class="form-label">Contraseña</label>
                    <input type="password" class="form-control" formControlName="password"
                      placeholder="••••••••" autocomplete="current-password" />
                  </div>

                  @if (errorLogin()) {
                    <div class="alert alert-danger py-2 small mb-3">{{ errorLogin() }}</div>
                  }

                  <button type="submit" class="btn btn-primary w-100"
                    [disabled]="loginForm.invalid || loading()">
                    {{ loading() ? 'Cargando...' : 'Ingresar' }}
                  </button>
                </form>

                <div class="d-flex align-items-center my-3">
                  <hr class="flex-grow-1" />
                  <span class="px-2 text-muted small">o</span>
                  <hr class="flex-grow-1" />
                </div>

                <button type="button"
                  class="btn btn-outline-secondary w-100 d-flex align-items-center justify-content-center gap-2"
                  (click)="loginWithGoogle()">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" width="18" height="18">
                    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  </svg>
                  Continuar con Google
                </button>
              }

              <!-- ===== VISTA REGISTRO ===== -->
              @if (vista() === 'registro') {

                @if (registroExitoso()) {
                  <div class="alert alert-success text-center">
                    <strong>Usuario registrado correctamente. Registro completo!</strong>
                  </div>
                } @else {
                  <form [formGroup]="registroForm" (ngSubmit)="onRegistro()">
                    <div class="row g-3 mb-3">
                      <div class="col-6">
                        <label class="form-label">Nombre <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" formControlName="nombre"
                          placeholder="Juan" />
                        @if (campoInvalido(registroForm, 'nombre')) {
                          <div class="invalid-feedback d-block small">Nombre requerido.</div>
                        }
                      </div>
                      <div class="col-6">
                        <label class="form-label">Apellido <span class="text-danger">*</span></label>
                        <input type="text" class="form-control" formControlName="apellido"
                          placeholder="Pérez" />
                        @if (campoInvalido(registroForm, 'apellido')) {
                          <div class="invalid-feedback d-block small">Apellido requerido.</div>
                        }
                      </div>
                    </div>

                    <div class="mb-3">
                      <label class="form-label">Correo electrónico <span class="text-danger">*</span></label>
                      <input type="email" class="form-control" formControlName="email"
                        placeholder="correo@ejemplo.com" autocomplete="email" />
                      @if (campoInvalido(registroForm, 'email')) {
                        <div class="invalid-feedback d-block small">Correo electrónico inválido.</div>
                      }
                    </div>

                    <div class="mb-3">
                      <label class="form-label">Contraseña <span class="text-danger">*</span></label>
                      <input type="password" class="form-control" formControlName="password"
                        placeholder="Mínimo 8 caracteres" autocomplete="new-password" />
                      @if (campoInvalido(registroForm, 'password')) {
                        <div class="invalid-feedback d-block small">Mínimo 8 caracteres.</div>
                      }
                    </div>

                    <div class="mb-3">
                      <label class="form-label">Teléfono <span class="text-danger">*</span></label>
                      <input type="tel" class="form-control" formControlName="telefono"
                        placeholder="+52 55 1234 5678" />
                      @if (campoInvalido(registroForm, 'telefono')) {
                        <div class="invalid-feedback d-block small">Teléfono requerido.</div>
                      }
                    </div>

                    <div class="mb-4">
                      <label class="form-label">Rol de acceso</label>
                      <input type="text" class="form-control" value="Cliente" disabled />
                    </div>

                    @if (errorRegistro()) {
                      <div class="alert alert-danger py-2 small mb-3">{{ errorRegistro() }}</div>
                    }

                    <button type="submit" class="btn btn-success w-100"
                      [disabled]="registroForm.invalid || loading()">
                      {{ loading() ? 'Registrando...' : 'Crear cuenta' }}
                    </button>
                  </form>
                }
              }

            </div>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private auth = inject(AuthSupabaseService);
  private router = inject(Router);
  private fb = inject(FormBuilder);

  vista = signal<'login' | 'registro'>('login');
  loading = signal(false);
  errorLogin = signal('');
  errorRegistro = signal('');
  registroExitoso = signal(false);

  loginForm = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  registroForm = this.fb.group({
    nombre:   ['', Validators.required],
    apellido: ['', Validators.required],
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
    telefono: ['', Validators.required],
  });

  cambiarVista(v: 'login' | 'registro') {
    this.vista.set(v);
    this.errorLogin.set('');
    this.errorRegistro.set('');
    this.registroExitoso.set(false);
  }

  campoInvalido(form: ReturnType<FormBuilder['group']>, campo: string): boolean {
    const ctrl = form.get(campo);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  async onLogin() {
    if (this.loginForm.invalid) return;
    this.loading.set(true);
    this.errorLogin.set('');

    try {
      const { email, password } = this.loginForm.value;
      await this.auth.signInWithEmail(email!, password!);
      this.router.navigate(['/client/dashboard']);
    } catch (error: any) {
      this.errorLogin.set(
        error?.message?.includes('Invalid login credentials')
          ? 'Correo o contraseña incorrectos.'
          : 'Error al iniciar sesión. Intenta de nuevo.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  async onRegistro() {
    if (this.registroForm.invalid) {
      this.registroForm.markAllAsTouched();
      return;
    }
    this.loading.set(true);
    this.errorRegistro.set('');

    try {
      const { email, password, nombre, apellido, telefono } = this.registroForm.value;
      await this.auth.signUp(email!, password!, {
        nombre: nombre!,
        apellido: apellido!,
        telefono: telefono!,
      });
      this.registroExitoso.set(true);
      setTimeout(() => this.router.navigate(['/client/dashboard']), 2000);
    } catch (error: any) {
      this.errorRegistro.set(
        error?.message?.includes('already registered')
          ? 'Este correo ya está registrado.'
          : 'Error al registrar. Intenta de nuevo.'
      );
    } finally {
      this.loading.set(false);
    }
  }

  async loginWithGoogle() {
    try {
      await this.auth.signInWithGoogle();
    } catch (error) {
      console.error('Error al autenticar con Google:', error);
    }
  }
}
