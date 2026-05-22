import { Component } from '@angular/core';
import { AdminServiceTypeListComponent } from './list/list.component';

@Component({
  selector: 'app-admin-service-types',
  standalone: true,
  imports: [AdminServiceTypeListComponent],
  template: `<app-admin-service-type-list />`,
})
export class AdminServiceTypesComponent {}
