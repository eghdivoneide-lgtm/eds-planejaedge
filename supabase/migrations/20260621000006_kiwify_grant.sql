-- ============================================================
-- kiwify_grant — RPC idempotente para créditos via Kiwify
-- Chamado exclusivamente pela Edge Function kiwify-webhook
-- ============================================================

-- Adiciona order_id ao payment_log (chave de idempotência)
ALTER TABLE public.payment_log
    ADD COLUMN IF NOT EXISTS order_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS payment_log_order_id_unique
    ON public.payment_log (order_id)
    WHERE order_id IS NOT NULL;

-- ============================================================
-- Função principal
-- ============================================================
CREATE OR REPLACE FUNCTION public.kiwify_grant(
    p_order_id  TEXT,
    p_email     TEXT,
    p_plano     TEXT,
    p_creditos  INTEGER,
    p_status    TEXT,
    p_payload   JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Idempotência: mesmo order_id não processa duas vezes
    IF p_order_id IS NOT NULL AND
       EXISTS (SELECT 1 FROM public.payment_log WHERE order_id = p_order_id) THEN
        RETURN jsonb_build_object(
            'ok',      true,
            'skipped', true,
            'reason',  'already_processed'
        );
    END IF;

    -- Localiza usuário pelo e-mail
    SELECT id INTO v_user_id
    FROM auth.users
    WHERE email = p_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        -- Usuário ainda não cadastrou — registra para reprocessamento manual
        INSERT INTO public.payment_log
            (order_id, email, plano, creditos_adicionados, kiwify_status, payload)
        VALUES
            (p_order_id, p_email, p_plano, 0, 'user_not_found', p_payload)
        ON CONFLICT (order_id) DO NOTHING;
        RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
    END IF;

    -- Adiciona créditos atomicamente
    UPDATE public.profiles
    SET creditos   = creditos + p_creditos,
        updated_at = NOW()
    WHERE id = v_user_id;

    -- Registra no histórico
    INSERT INTO public.payment_log
        (order_id, email, plano, creditos_adicionados, kiwify_status, payload)
    VALUES
        (p_order_id, p_email, p_plano, p_creditos, p_status, p_payload)
    ON CONFLICT (order_id) DO NOTHING;

    RETURN jsonb_build_object(
        'ok',                true,
        'creditos_adicionados', p_creditos,
        'plano',             p_plano
    );
END;
$$;

-- Apenas service_role pode chamar (Edge Functions usam service_role)
REVOKE ALL ON FUNCTION public.kiwify_grant(TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.kiwify_grant(TEXT, TEXT, TEXT, INTEGER, TEXT, JSONB)
    TO service_role;
