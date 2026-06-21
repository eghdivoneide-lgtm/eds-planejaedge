-- Histórico de pagamentos Kiwify (opcional — o webhook não falha se a tabela não existir)
CREATE TABLE IF NOT EXISTS public.payment_log (
    id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email               TEXT NOT NULL,
    plano               TEXT NOT NULL,
    creditos_adicionados INTEGER NOT NULL,
    kiwify_status       TEXT,
    payload             JSONB,
    created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Apenas o service_role pode inserir/ler (webhook usa service_role key)
ALTER TABLE public.payment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_log_service_only" ON public.payment_log
    USING (false);  -- nenhum usuário autenticado acessa diretamente

-- Índice para consultas por email
CREATE INDEX IF NOT EXISTS payment_log_email_idx ON public.payment_log (email);
CREATE INDEX IF NOT EXISTS payment_log_created_idx ON public.payment_log (created_at DESC);
