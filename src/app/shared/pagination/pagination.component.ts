import { Component, Input, Output, EventEmitter, OnChanges } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-pagination',
  standalone: true,
  imports: [TranslatePipe],
  templateUrl: './pagination.component.html',
  styleUrl: './pagination.component.css',
})
export class PaginationComponent implements OnChanges {
  @Input() total    = 0;
  @Input() page     = 1;
  @Input() pageSize = 10;
  @Output() pageChange = new EventEmitter<number>();

  totalPages = 0;
  pages: (number | '...')[] = [];

  ngOnChanges(): void {
    this.totalPages = Math.max(1, Math.ceil(this.total / this.pageSize));
    this.pages = this.buildPages();
  }

  private buildPages(): (number | '...')[] {
    const t = this.totalPages;
    const c = this.page;
    if (t <= 7) return Array.from({ length: t }, (_, i) => i + 1);

    const result: (number | '...')[] = [1];
    if (c > 3)       result.push('...');
    const start = Math.max(2, c - 1);
    const end   = Math.min(t - 1, c + 1);
    for (let i = start; i <= end; i++) result.push(i);
    if (c < t - 2)   result.push('...');
    result.push(t);
    return result;
  }

  go(p: number | '...'): void {
    if (p === '...' || p === this.page) return;
    this.pageChange.emit(p as number);
  }

  prev(): void { if (this.page > 1)               this.pageChange.emit(this.page - 1); }
  next(): void { if (this.page < this.totalPages)  this.pageChange.emit(this.page + 1); }

  get from(): number { return Math.min((this.page - 1) * this.pageSize + 1, this.total); }
  get to():   number { return Math.min(this.page * this.pageSize, this.total); }
}
