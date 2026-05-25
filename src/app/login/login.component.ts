import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthSupabaseService } from '../services/auth-supabase.service';
import { LangService, Lang } from '../services/lang.service';
import { RolUsuario } from '../types/supabase';
import { passwordComplexityValidator } from '../shared/validators/password.validator';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe, RouterLink],
  templateUrl: './login.component.html',
  styleUrl:    './login.component.css',
})
export class LoginComponent implements OnInit {
  private auth   = inject(AuthSupabaseService);
  private router = inject(Router);
  private route  = inject(ActivatedRoute);
  private fb     = inject(FormBuilder);
  lang           = inject(LangService);

  vista            = signal<'login' | 'registro'>('login');
  loading          = signal(false);
  errorLogin       = signal('');
  errorRegistro    = signal('');
  registroExitoso  = signal(false);
  mostrarPassword  = false;
  rolRegistro      = signal<RolUsuario>('cliente');

  loginForm = this.fb.group({
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
  });

  registroForm = this.fb.group({
    nombre:   ['', Validators.required],
    apellido: ['', Validators.required],
    email:    ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, passwordComplexityValidator]],
    telefono: ['', Validators.required],
  });

  get fl() { return this.loginForm.controls; }
  get fr() { return this.registroForm.controls; }

  ngOnInit(): void {
    const role = this.route.snapshot.queryParamMap.get('role');
    if (role === 'constructor') {
      this.rolRegistro.set('constructor');
      this.vista.set('registro');
    }
  }

  setLang(l: Lang) { this.lang.set(l); }

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
    if (this.loginForm.invalid) { this.loginForm.markAllAsTouched(); return; }
    this.loading.set(true);
    this.errorLogin.set('');
    try {
      const { email, password } = this.loginForm.value;
      await this.auth.signInWithEmail(email!, password!);
      this.router.navigate([await this.auth.getHomeRoute()]);
    } catch (error: any) {
      this.errorLogin.set(
        error?.message === 'account_inactive'
          ? 'auth.account_inactive'
          : error?.message?.includes('Invalid login credentials')
          ? 'auth.invalid_credentials'
          : 'auth.login_error',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async onRegistro() {
    if (this.registroForm.invalid) { this.registroForm.markAllAsTouched(); return; }
    this.loading.set(true);
    this.errorRegistro.set('');
    try {
      const { email, password, nombre, apellido, telefono } = this.registroForm.value;
      await this.auth.signUp(email!, password!, {
        nombre: nombre!, apellido: apellido!, telefono: telefono!, rol: this.rolRegistro(),
      });
      this.registroExitoso.set(true);
      const destino = this.rolRegistro() === 'constructor' ? '/builder/dashboard' : '/client/dashboard';
      setTimeout(() => this.router.navigate([destino]), 2000);
    } catch (error: any) {
      this.errorRegistro.set(
        error?.message?.includes('already registered')
          ? 'auth.email_registered'
          : 'auth.register_error',
      );
    } finally {
      this.loading.set(false);
    }
  }

  async loginWithGoogle() {
    try {
      await this.auth.signInWithGoogle();
    } catch (error) {
      console.error('[Login] Google:', error);
    }
  }
}
