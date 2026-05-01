import { Routes } from '@angular/router';
import { LandingPageComponent } from './landing-page/landing-page.component';
import { LoginComponent } from './login/login.component';
import { DashboardComponent } from './client/dashboard/dashboard.component';
import { FileCreateComponent } from './client/file/create/create.component';
import { MyFilesComponent } from './client/file/my-files/my-files.component';
import { FilesToBeEstimatedComponent } from './estimator/files-to-be-estimated/files-to-be-estimated.component';
import { FilesUnderEstimationComponent } from './estimator/files-under-estimation/files-under-estimation.component';
import { FileUnderEstimationComponent } from './estimator/file-under-estimation/file-under-estimation.component';
import { EstimatedFilesComponent } from './estimator/estimated-files/estimated-files.component';
import { FileToBeEstimatedComponent } from './estimator/file-to-be-estimated/file-to-be-estimated.component';
import { authGuard, estimatorGuard, guestGuard } from './auth.guard';

export const routes: Routes = [
  { path: '', component: LandingPageComponent },
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'client/dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'client/file/create', component: FileCreateComponent, canActivate: [authGuard] },
  { path: 'client/file/my-files', component: MyFilesComponent, canActivate: [authGuard] },
  { path: 'estimator/files-to-be-estimated', component: FilesToBeEstimatedComponent, canActivate: [estimatorGuard] },
  { path: 'estimator/file-to-be-estimated/:id', component: FileToBeEstimatedComponent, canActivate: [estimatorGuard] },
  { path: 'estimator/files-under-estimation', component: FilesUnderEstimationComponent, canActivate: [estimatorGuard] },
  { path: 'estimator/file-under-estimation/:id', component: FileUnderEstimationComponent, canActivate: [estimatorGuard] },
  { path: 'estimator/estimated-files', component: EstimatedFilesComponent, canActivate: [estimatorGuard] },
  
  { path: '**', redirectTo: '' },
];
