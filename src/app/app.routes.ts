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
import { EstimatedFileComponent } from './estimator/estimated-file/estimated-file.component';
import { FileToBeEstimatedComponent } from './estimator/file-to-be-estimated/file-to-be-estimated.component';
import { EstimatorDashboardComponent } from './estimator/dashboard/dashboard.component';
import { adminGuard, authGuard, constructorGuard, estimatorGuard, guestGuard, wildcardGuard } from './auth.guard';
import { AdminDashboardComponent } from './admin/dashboard/dashboard.component';
import { AdminFileComponent } from './admin/file/file.component';
import { AdminOfferListComponent } from './admin/offer/list/list.component';
import { AdminOfferEditComponent } from './admin/offer/edit/edit.component';
import { AdminContractComponent } from './admin/contract/contract.component';
import { AdminServiceTypesComponent } from './admin/service-types/service-types.component';
import { AdminUserComponent } from './admin/user/user.component';
import { AdminUserCreateComponent } from './admin/user/create/create.component';
import { AdminUserEditComponent } from './admin/user/edit/edit.component';
import { AvailableFilesComponent } from './builder/available-files/available-files.component';
import { MakeOfferComponent } from './builder/make-offer/make-offer.component';
import { MyOffersComponent } from './builder/my-offers/my-offers.component';
import { MyOfferComponent } from './builder/my-offer/my-offer.component';
import { BuilderDashboardComponent } from './builder/dashboard/dashboard.component';
import { OffersReceivedComponent } from './client/offers-received/offers-received.component';
import { BuilderOfferComponent } from './client/builder-offer/builder-offer.component';
import { PerfilComponent } from './client/perfil/perfil.component';
import { MyFileComponent } from './client/file/my-file/my-file.component';
import { ContractListComponent } from './client/contract/list/list.component';
import { AdminFileCreateComponent } from './admin/file/create/create.component';
import { AdminFileEditComponent } from './admin/file/edit/edit.component';
import { AdminServiceTypeEditComponent }   from './admin/service-types/edit/edit.component';
import { AdminServiceTypeCreateComponent } from './admin/service-types/create/create.component';
import { AdminToEstimateListComponent }    from './admin/to-estimate/list/list.component';
import { AdminToEstimateEditComponent }    from './admin/to-estimate/edit/edit.component';
import { ListComponent as AdminOffersReceivedListComponent } from './admin/offers-received/list/list.component';

export const routes: Routes = [
  { path: '', component: LandingPageComponent, canActivate: [guestGuard] },
  { path: 'login', component: LoginComponent, canActivate: [guestGuard] },
  { path: 'client/dashboard', component: DashboardComponent, canActivate: [authGuard] },
  { path: 'client/file/create', component: FileCreateComponent, canActivate: [authGuard] },
  { path: 'client/file/my-files', component: MyFilesComponent, canActivate: [authGuard] },
  { path: 'client/file/my-file/:id', component: MyFileComponent, canActivate: [authGuard] },
  { path: 'client/offers-received', component: OffersReceivedComponent, canActivate: [authGuard] },
  { path: 'client/builder-offer/:id', component: BuilderOfferComponent, canActivate: [authGuard] },
  { path: 'client/contracts', component: ContractListComponent, canActivate: [authGuard] },
  { path: 'client/perfil', component: PerfilComponent, canActivate: [authGuard] },
  { path: 'estimator/dashboard', component: EstimatorDashboardComponent, canActivate: [estimatorGuard] },
  { path: 'estimator/files-to-be-estimated', component: FilesToBeEstimatedComponent, canActivate: [estimatorGuard] },
  { path: 'estimator/file-to-be-estimated/:id', component: FileToBeEstimatedComponent, canActivate: [estimatorGuard] },
  { path: 'estimator/files-under-estimation', component: FilesUnderEstimationComponent, canActivate: [estimatorGuard] },
  { path: 'estimator/file-under-estimation/:id', component: FileUnderEstimationComponent, canActivate: [estimatorGuard] },
  { path: 'estimator/estimated-files', component: EstimatedFilesComponent, canActivate: [estimatorGuard] },
  { path: 'estimator/estimated-file/:id', component: EstimatedFileComponent, canActivate: [estimatorGuard] },
  
  { path: 'builder/dashboard', component: BuilderDashboardComponent, canActivate: [constructorGuard] },
  { path: 'builder/available-files', component: AvailableFilesComponent, canActivate: [constructorGuard] },
  { path: 'builder/make-offer/:id', component: MakeOfferComponent, canActivate: [constructorGuard] },
  { path: 'builder/my-offers', component: MyOffersComponent, canActivate: [constructorGuard] },
  { path: 'builder/my-offer/:id', component: MyOfferComponent, canActivate: [constructorGuard] },

  { path: 'admin/dashboard',       component: AdminDashboardComponent,    canActivate: [adminGuard] },
  { path: 'admin/file',            component: AdminFileComponent,         canActivate: [adminGuard] },
  { path: 'admin/file/create',     component: AdminFileCreateComponent,   canActivate: [adminGuard] },
  { path: 'admin/file/edit/:id',   component: AdminFileEditComponent,     canActivate: [adminGuard] },
  { path: 'admin/offer',                    component: AdminOfferListComponent,          canActivate: [adminGuard] },
  { path: 'admin/offer/edit/:id',           component: AdminOfferEditComponent,          canActivate: [adminGuard] },
  { path: 'admin/offers-received/list',     component: AdminOffersReceivedListComponent, canActivate: [adminGuard] },
  { path: 'admin/contract',     component: AdminContractComponent,     canActivate: [adminGuard] },
  { path: 'admin/service-type',            component: AdminServiceTypesComponent,      canActivate: [adminGuard] },
  { path: 'admin/service-type/create',    component: AdminServiceTypeCreateComponent, canActivate: [adminGuard] },
  { path: 'admin/service-type/edit/:id',  component: AdminServiceTypeEditComponent,   canActivate: [adminGuard] },
  { path: 'admin/to-estimate',            component: AdminToEstimateListComponent, canActivate: [adminGuard] },
  { path: 'admin/to-estimate/edit/:id',   component: AdminToEstimateEditComponent,  canActivate: [adminGuard] },
  { path: 'admin/user',         component: AdminUserComponent,           canActivate: [adminGuard] },
  { path: 'admin/user/create',  component: AdminUserCreateComponent,     canActivate: [adminGuard] },
  { path: 'admin/user/edit/:id', component: AdminUserEditComponent,      canActivate: [adminGuard] },

  { path: '**', canActivate: [wildcardGuard], component: LandingPageComponent },
];
