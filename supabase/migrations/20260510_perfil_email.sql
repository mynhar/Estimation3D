-- ============================================================
-- Agregar columna email a perfil y poblarla desde auth.users.
-- El email no se guarda en perfil por defecto; esta migración
-- lo copia via trigger para que sea accesible con RLS normal.
-- ============================================================

ALTER TABLE perfil ADD COLUMN IF NOT EXISTS email text;

-- Backfill de filas existentes
UPDATE perfil p
SET email = u.email
FROM auth.users u
WHERE u.id = p.id
  AND p.email IS NULL;

-- Función trigger SECURITY DEFINER para copiar el email al insertar un perfil
CREATE OR REPLACE FUNCTION fn_perfil_copy_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  SELECT email INTO NEW.email FROM auth.users WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

-- Trigger BEFORE INSERT en perfil
DROP TRIGGER IF EXISTS trg_perfil_copy_email ON perfil;
CREATE TRIGGER trg_perfil_copy_email
BEFORE INSERT ON perfil
FOR EACH ROW EXECUTE FUNCTION fn_perfil_copy_email();
