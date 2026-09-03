-- Trilha de diagnóstico da impressão de etiquetas, em tabela.
--
-- O endpoint /api/debug-log guardava as linhas num array em memória, com um
-- comentário dizendo que "Fluid Compute reusa a instância". Reusa às vezes: o
-- POST do app caiu numa instância e a leitura, minutos depois, em outra — e o
-- diagnóstico da primeira impressão do dia, que é justamente a que sai em
-- branco, se perdeu inteiro. Diagnóstico que some quando é preciso não é
-- diagnóstico.
--
-- Uma linha por trabalho de impressão. Poucas dezenas por dia, texto curto:
-- não vale índice além do da data.

CREATE TABLE IF NOT EXISTS public.diagnostico_impressao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 'app' ou 'navegador': de onde a impressão saiu.
  origem TEXT NOT NULL DEFAULT 'app',
  -- A trilha inteira, uma linha por passo do trabalho.
  trilha TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS diagnostico_impressao_data_idx
  ON public.diagnostico_impressao (created_at DESC);

ALTER TABLE public.diagnostico_impressao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS diagnostico_impressao_tudo ON public.diagnostico_impressao;
CREATE POLICY diagnostico_impressao_tudo
  ON public.diagnostico_impressao FOR ALL USING (true) WITH CHECK (true);

-- Apaga o que passou de 30 dias. Chamada pelo próprio endpoint depois de
-- gravar: sem isto a tabela cresceria para sempre por causa de uma ferramenta
-- que só serve para investigar a semana corrente.
CREATE OR REPLACE FUNCTION public.limpar_diagnostico_impressao()
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM public.diagnostico_impressao
  WHERE created_at < now() - INTERVAL '30 days';
$$;
