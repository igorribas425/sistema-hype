-- HYPE V210: retiradas bancárias registradas separadamente do faturamento.
-- Aplicação no projeto Supabase da HYPE. Não altera tickets, lotes nem check-ins.
CREATE TABLE IF NOT EXISTS public.hype_finance_movements_v210 (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  movement_type text NOT NULL CHECK (movement_type IN ('retirada','estorno_retirada')),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  origin text NOT NULL DEFAULT 'banco',
  description text NOT NULL,
  related_event_id bigint REFERENCES public.events(id) ON DELETE RESTRICT,
  reference_key text UNIQUE,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  recorded_at timestamptz NOT NULL DEFAULT now(),
  recorded_by text NOT NULL DEFAULT 'administrador'
);
ALTER TABLE public.hype_finance_movements_v210 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.hype_finance_movements_v210 FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.hype_finance_movements_v210_id_seq FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.staff_list_hype_finance_movements_v210(
  p_username text, p_password text
)
RETURNS TABLE (
  id bigint, movement_type text, amount numeric, origin text,
  description text, related_event_id bigint,
  occurred_at timestamptz, recorded_at timestamptz, recorded_by text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  PERFORM private.hype_require_staff(p_username, p_password, ARRAY['admin']);
  RETURN QUERY
  SELECT m.id, m.movement_type, m.amount, m.origin, m.description,
         m.related_event_id, m.occurred_at, m.recorded_at, m.recorded_by
    FROM public.hype_finance_movements_v210 AS m
   ORDER BY m.recorded_at DESC, m.id DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.staff_list_hype_finance_movements_v210(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.staff_list_hype_finance_movements_v210(text,text) TO anon, authenticated;
-- A retirada efetiva de R$60 foi registrada em produção como dado auditável,
-- não como um lançamento automático de esquema.
