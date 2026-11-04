import { Directive, ElementRef, Injectable, OnDestroy, inject } from '@angular/core';
import { AbstractControl, NgControl } from '@angular/forms';

interface Entrada {
  ngControl: NgControl;
  el: HTMLElement;
}

/**
 * Qué elemento del DOM pinta cada control. Angular no lo expone, y el resumen
 * de campos faltantes lo necesita para leer la etiqueta y llevar el foco.
 *
 * El control se resuelve al consultar (no al registrar) porque
 * `FormControlName` lo enlaza en su `ngOnChanges`, que puede ir después del
 * constructor de esta directiva.
 */
@Injectable({ providedIn: 'root' })
export class RegistroCampos {
  private entradas = new Set<Entrada>();

  agregar(e: Entrada): void { this.entradas.add(e); }
  quitar(e: Entrada): void  { this.entradas.delete(e); }

  elementoDe(control: AbstractControl): HTMLElement | null {
    for (const e of this.entradas) {
      if (e.ngControl.control === control && e.el.isConnected) return e.el;
    }
    return null;
  }
}

/**
 * Se cuelga sola de cada `formControlName` / `formControl` del componente que
 * la importe (va en `CAMPOS_FALTANTES`). No cambia nada del control.
 */
@Directive({
  selector: '[formControlName],[formControl]',
  standalone: true,
})
export class CampoFormularioDirective implements OnDestroy {
  private registro = inject(RegistroCampos);
  private entrada: Entrada = {
    ngControl: inject(NgControl, { self: true }),
    el:        inject<ElementRef<HTMLElement>>(ElementRef).nativeElement,
  };

  constructor() { this.registro.agregar(this.entrada); }

  ngOnDestroy(): void { this.registro.quitar(this.entrada); }
}
