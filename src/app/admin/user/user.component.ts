import { Component } from '@angular/core';
import { AdminUserListComponent } from './list/list.component';

@Component({
  selector: 'app-admin-user',
  standalone: true,
  imports: [AdminUserListComponent],
  template: `<app-admin-user-list />`,
})
export class AdminUserComponent {}
