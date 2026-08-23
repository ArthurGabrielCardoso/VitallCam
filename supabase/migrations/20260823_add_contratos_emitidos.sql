-- Histórico de contratos emitidos por paciente.
--
-- Registra o momento em que o documento foi impresso para assinatura: é o que a
-- clínica considera "contrato feito". Guarda os valores preenchidos (JSONB) pra
-- que o documento possa ser reaberto igual ao que foi assinado, sem depender do
-- rascunho no localStorage — que é por dispositivo e se perde.

CREATE TABLE IF NOT EXISTS public.contratos_emitidos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.patients(id) ON DELETE CASCADE,
  -- id do modelo em src/lib/contracts (texto, não FK: os modelos vivem no código)
  template_id TEXT NOT NULL,
  titulo TEXT NOT NULL,
  eyebrow TEXT,
  grupo TEXT,
  profissional TEXT,
  valores JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- A lista do paciente é sempre "mais recentes primeiro".
CREATE INDEX IF NOT EXISTS idx_contratos_emitidos_paciente
  ON public.contratos_emitidos (patient_id, created_at DESC);

ALTER TABLE public.contratos_emitidos ENABLE ROW LEVEL SECURITY;

-- Mesma política das demais tabelas do app (acesso pela anon key do cliente).
DROP POLICY IF EXISTS "contratos_emitidos_all" ON public.contratos_emitidos;
CREATE POLICY "contratos_emitidos_all" ON public.contratos_emitidos
  FOR ALL USING (true) WITH CHECK (true);
