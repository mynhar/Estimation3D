import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

export const passwordComplexityValidator: ValidatorFn = (
  control: AbstractControl,
): ValidationErrors | null => {
  const v: string = control.value ?? '';
  if (!v) return null;

  const errors: ValidationErrors = {};
  if (v.length < 8)            errors['pwMin']     = true;
  if (!/[A-Z]/.test(v))        errors['pwUpper']   = true;
  if (!/[a-z]/.test(v))        errors['pwLower']   = true;
  if (!/[0-9]/.test(v))        errors['pwDigit']   = true;
  if (!/[^A-Za-z0-9]/.test(v)) errors['pwSpecial'] = true;

  return Object.keys(errors).length ? errors : null;
};
