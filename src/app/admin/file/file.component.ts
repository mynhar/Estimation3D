import { Component } from '@angular/core';
import { AdminFileListComponent } from './list/list.component';

@Component({
  selector: 'app-admin-file',
  standalone: true,
  imports: [AdminFileListComponent],
  template: `<app-admin-file-list />`,
})
export class AdminFileComponent {}
