import { AbstractControl, ValidationErrors } from '@angular/forms';

/**
 * Las especialidades son obligatorias para el constructor y se pueden declarar
 * de dos maneras, cualquiera de las dos basta: marcando «Todos los servicios»,
 * o eligiendo al menos uno de la lista.
 *
 * El validador vive en el control de la lista —y no en el grupo— para que el
 * error se pinte junto a las casillas, y lee el campo hermano `especialidad_todas`
 * a través del padre. Lo comparten el alta y la edición: es la misma regla.
 */
export function especialidadesRequeridas(ctrl: AbstractControl): ValidationErrors | null {
  const todas = ctrl.parent?.get('especialidad_todas')?.value === true;
  const lista = (ctrl.value ?? []) as number[];
  return todas || lista.length > 0 ? null : { required: true };
}
