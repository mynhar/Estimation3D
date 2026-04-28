import { Routes } from '@angular/router';
import { LandingPageComponent } from './landing-page/landing-page.component';
import { LoginComponent } from './login/login.component';
import { DashboardComponent } from './client/dashboard/dashboard.component';
import { FileCreateComponent } from './client/file/create/create.component';
import { MyFilesComponent } from './client/file/my-files/my-files.component';
import { authGuard, guestGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', component: LandingPageComponent },
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'client/dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'client/file/create', component: FileCreateComponent, canActivate: [authGuard] },
  { path: 'client/file/my-files', component: MyFilesComponent, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
