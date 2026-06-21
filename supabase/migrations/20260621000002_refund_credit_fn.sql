-- Função de estorno atômico de crédito
-- Chamada pelo ai-proxy quando o Gemini retorna erro após o débito
CREATE OR REPLACE FUNCTION public.refund_credit(p_user_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles
  SET creditos = creditos + 1, updated_at = NOW()
  WHERE id = p_user_id;
$$;
