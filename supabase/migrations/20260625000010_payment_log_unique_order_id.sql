-- Corrige erro 42P10 no kiwify_grant: o INSERT ... ON CONFLICT (order_id)
-- exige um indice unico em payment_log.order_id. Sem ele, o Postgres recusa
-- e o credito inteiro falha (mesmo com o webhook correto).
-- Alinha o PlanejaEdge ao LicitaEdge, que ja tinha esse indice.
CREATE UNIQUE INDEX IF NOT EXISTS payment_log_order_id_key
    ON public.payment_log (order_id);
