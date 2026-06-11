import { Routes } from '@angular/router';
import {
  adminGuard,
  authGuard,
  constructorGuard,
  estimatorGuard,
  guestGuard,
  wildcardGuard,
} from './auth.guard';

export const routes: Routes = [
  // ── Público ──────────────────────────────────────────────────────────────
  {
    path: '',
    loadComponent: () => import('./landing-page/landing-page.component').then(m => m.LandingPageComponent),
    canActivate: [guestGuard],
  },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then(m => m.LoginComponent),
    canActivate: [guestGuard],
  },

  // ── Cliente ───────────────────────────────────────────────────────────────
  {
    path: 'client/dashboard',
    loadComponent: () => import('./client/dashboard/dashboard.component').then(m => m.DashboardComponent),
    canActivate: [authGuard],
  },
  {
    path: 'client/file/create',
    loadComponent: () => import('./client/file/create/create.component').then(m => m.FileCreateComponent),
    canActivate: [authGuard],
  },
  {
    path: 'client/file/my-files',
    loadComponent: () => import('./client/file/my-files/my-files.component').then(m => m.MyFilesComponent),
    canActivate: [authGuard],
  },
  {
    path: 'client/file/my-file/:id',
    loadComponent: () => import('./client/file/my-file/my-file.component').then(m => m.MyFileComponent),
    canActivate: [authGuard],
  },
  {
    path: 'client/offers-received',
    loadComponent: () => import('./client/offers-received/offers-received.component').then(m => m.OffersReceivedComponent),
    canActivate: [authGuard],
  },
  {
    path: 'client/builder-offer/:id',
    loadComponent: () => import('./client/builder-offer/builder-offer.component').then(m => m.BuilderOfferComponent),
    canActivate: [authGuard],
  },
  {
    path: 'client/contracts',
    loadComponent: () => import('./client/contract/list/list.component').then(m => m.ContractListComponent),
    canActivate: [authGuard],
  },
  {
    path: 'client/perfil',
    loadComponent: () => import('./client/perfil/perfil.component').then(m => m.PerfilComponent),
    canActivate: [authGuard],
  },

  // ── Estimador ─────────────────────────────────────────────────────────────
  {
    path: 'estimator/client/list',
    loadComponent: () => import('./estimator/client/list/list.component').then(m => m.EstimatorClientListComponent),
    canActivate: [estimatorGuard],
  },
  {
    path: 'estimator/client/create',
    loadComponent: () => import('./estimator/client/create/create.component').then(m => m.EstimatorClientCreateComponent),
    canActivate: [estimatorGuard],
  },
  {
    path: 'estimator/client/edit/:id',
    loadComponent: () => import('./estimator/client/edit/edit.component').then(m => m.EstimatorClientEditComponent),
    canActivate: [estimatorGuard],
  },
  {
    path: 'estimator/file/create',
    loadComponent: () => import('./estimator/file/create/create.component').then(m => m.EstimatorFileCreateComponent),
    canActivate: [estimatorGuard],
  },
  {
    path: 'estimator/dashboard',
    loadComponent: () => import('./estimator/dashboard/dashboard.component').then(m => m.EstimatorDashboardComponent),
    canActivate: [estimatorGuard],
  },
  {
    path: 'estimator/files-to-be-estimated',
    loadComponent: () => import('./estimator/files-to-be-estimated/files-to-be-estimated.component').then(m => m.FilesToBeEstimatedComponent),
    canActivate: [estimatorGuard],
  },
  {
    path: 'estimator/file-to-be-estimated/:id',
    loadComponent: () => import('./estimator/file-to-be-estimated/file-to-be-estimated.component').then(m => m.FileToBeEstimatedComponent),
    canActivate: [estimatorGuard],
  },
  {
    path: 'estimator/files-under-estimation',
    loadComponent: () => import('./estimator/files-under-estimation/files-under-estimation.component').then(m => m.FilesUnderEstimationComponent),
    canActivate: [estimatorGuard],
  },
  {
    path: 'estimator/file-under-estimation/:id',
    loadComponent: () => import('./estimator/file-under-estimation/file-under-estimation.component').then(m => m.FileUnderEstimationComponent),
    canActivate: [estimatorGuard],
  },
  {
    path: 'estimator/estimated-files',
    loadComponent: () => import('./estimator/estimated-files/estimated-files.component').then(m => m.EstimatedFilesComponent),
    canActivate: [estimatorGuard],
  },
  {
    path: 'estimator/estimated-file/:id',
    loadComponent: () => import('./estimator/estimated-file/estimated-file.component').then(m => m.EstimatedFileComponent),
    canActivate: [estimatorGuard],
  },

  // ── Constructor ───────────────────────────────────────────────────────────
  {
    path: 'builder/dashboard',
    loadComponent: () => import('./builder/dashboard/dashboard.component').then(m => m.BuilderDashboardComponent),
    canActivate: [constructorGuard],
  },
  {
    path: 'builder/available-files',
    loadComponent: () => import('./builder/available-files/available-files.component').then(m => m.AvailableFilesComponent),
    canActivate: [constructorGuard],
  },
  {
    path: 'builder/make-offer/:id',
    loadComponent: () => import('./builder/make-offer/make-offer.component').then(m => m.MakeOfferComponent),
    canActivate: [constructorGuard],
  },
  {
    path: 'builder/my-offers',
    loadComponent: () => import('./builder/my-offers/my-offers.component').then(m => m.MyOffersComponent),
    canActivate: [constructorGuard],
  },
  {
    path: 'builder/my-offer/:id',
    loadComponent: () => import('./builder/my-offer/my-offer.component').then(m => m.MyOfferComponent),
    canActivate: [constructorGuard],
  },
  {
    path: 'builder/construction-monitoring/list',
    loadComponent: () => import('./builder/construction-monitoring/list/list.component').then(m => m.ConstructionMonitoringListComponent),
    canActivate: [constructorGuard],
  },
  {
    path: 'builder/construction-monitoring/monitoring/:id',
    loadComponent: () => import('./builder/construction-monitoring/monitoring/monitoring.component').then(m => m.ConstructionMonitoringComponent),
    canActivate: [constructorGuard],
  },

  // ── Administrador ─────────────────────────────────────────────────────────
  {
    path: 'admin/dashboard',
    loadComponent: () => import('./admin/dashboard/dashboard.component').then(m => m.AdminDashboardComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/file',
    loadComponent: () => import('./admin/file/list/list.component').then(m => m.AdminFileListComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/file/create',
    loadComponent: () => import('./admin/file/create/create.component').then(m => m.AdminFileCreateComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/file/edit/:id',
    loadComponent: () => import('./admin/file/edit/edit.component').then(m => m.AdminFileEditComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/offer',
    loadComponent: () => import('./admin/offer/list/list.component').then(m => m.AdminOfferListComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/offer/edit/:id',
    loadComponent: () => import('./admin/offer/edit/edit.component').then(m => m.AdminOfferEditComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/contract',
    loadComponent: () => import('./admin/contract/list/list.component').then(m => m.AdminContractListComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/contract/edit/:id',
    loadComponent: () => import('./admin/contract/edit/edit.component').then(m => m.AdminContractEditComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/service-type',
    loadComponent: () => import('./admin/service-types/list/list.component').then(m => m.AdminServiceTypeListComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/service-type/create',
    loadComponent: () => import('./admin/service-types/create/create.component').then(m => m.AdminServiceTypeCreateComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/service-type/edit/:id',
    loadComponent: () => import('./admin/service-types/edit/edit.component').then(m => m.AdminServiceTypeEditComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/to-estimate',
    loadComponent: () => import('./admin/to-estimate/list/list.component').then(m => m.AdminToEstimateListComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/to-estimate/edit/:id',
    loadComponent: () => import('./admin/to-estimate/edit/edit.component').then(m => m.AdminToEstimateEditComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/user',
    loadComponent: () => import('./admin/user/list/list.component').then(m => m.AdminUserListComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/user/create',
    loadComponent: () => import('./admin/user/create/create.component').then(m => m.AdminUserCreateComponent),
    canActivate: [adminGuard],
  },
  {
    path: 'admin/user/edit/:id',
    loadComponent: () => import('./admin/user/edit/edit.component').then(m => m.AdminUserEditComponent),
    canActivate: [adminGuard],
  },

  { path: '**', canActivate: [wildcardGuard], loadComponent: () => import('./landing-page/landing-page.component').then(m => m.LandingPageComponent) },
];
