-- Função de débito atômico de crédito
-- Resolve race condition: faz SELECT + UPDATE em uma única transação
CREATE OR REPLACE FUNCTION public.debit_credit(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining integer;
BEGIN
  UPDATE profiles
  SET creditos = creditos - 1, updated_at = NOW()
  WHERE id = p_user_id AND creditos > 0
  RETURNING creditos INTO remaining;
  RETURN remaining; -- NULL se não atualizou (sem créditos)
END;
$$;
