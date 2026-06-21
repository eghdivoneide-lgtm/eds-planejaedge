-- Admin e rate limiting
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_ai_at TIMESTAMPTZ;

-- Atualiza debit_credit com rate limit de 3 segundos
CREATE OR REPLACE FUNCTION public.debit_credit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining integer;
  last_at   TIMESTAMPTZ;
BEGIN
  SELECT last_ai_at INTO last_at FROM profiles WHERE id = p_user_id;
  IF last_at IS NOT NULL AND last_at > NOW() - INTERVAL '3 seconds' THEN
    RETURN -1;  -- rate limited
  END IF;
  UPDATE profiles
  SET creditos = creditos - 1, updated_at = NOW(), last_ai_at = NOW()
  WHERE id = p_user_id AND creditos > 0
  RETURNING creditos INTO remaining;
  RETURN remaining;
END;
$$;

-- Lista todos os usuários (somente admins)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(id uuid, email text, creditos integer, is_admin boolean, created_at timestamptz, last_ai_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  RETURN QUERY
    SELECT p.id, p.email, p.creditos, p.is_admin, p.created_at, p.last_ai_at
    FROM profiles p ORDER BY p.created_at DESC;
END;
$$;

-- Adiciona créditos a um professor (somente admins)
CREATE OR REPLACE FUNCTION public.admin_add_credits(p_email text, p_amount integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_val integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = TRUE) THEN
    RAISE EXCEPTION 'not_admin';
  END IF;
  UPDATE profiles
  SET creditos = creditos + p_amount, updated_at = NOW()
  WHERE email = p_email
  RETURNING creditos INTO new_val;
  IF new_val IS NULL THEN RAISE EXCEPTION 'user_not_found'; END IF;
  RETURN new_val;
END;
$$;
