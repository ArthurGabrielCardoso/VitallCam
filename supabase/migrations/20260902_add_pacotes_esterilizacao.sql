-- Um registro por pacote, não por ciclo.
--
-- O ciclo diz que dez pacotes foram esterilizados juntos. Não diz que cinco
-- foram para a Maria e cinco para o João — e é exatamente isso que a
-- rastreabilidade da RDC 1.002/2025 quer poder responder. Com o lote sozinho, um
-- indicador biológico positivo três dias depois obriga a avisar todo mundo que
-- passou pela cadeira naquele dia; com o pacote identificado, avisa quem de fato
-- recebeu material daquele ciclo.
--
-- O código impresso é LOTE-NN: 0901-02-03 é o terceiro pacote do segundo ciclo
-- do dia 1º de setembro. Curto de propósito — cada caractere a mais engorda o QR,
-- e num adesivo de 12 mm o módulo encolhe até a câmera não ler.

CREATE TABLE IF NOT EXISTS public.esterilizacao_pacotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id UUID NOT NULL REFERENCES public.esterilizacao_ciclos(id) ON DELETE CASCADE,
  -- 1..N dentro do ciclo, na ordem em que as etiquetas saem.
  sequencia INT NOT NULL,
  -- O que vai impresso e dentro do QR.
  codigo TEXT NOT NULL,
  -- Nulo enquanto o pacote está no estoque. Preenchido no atendimento.
  patient_id UUID REFERENCES public.patients(id) ON DELETE SET NULL,
  usado_em TIMESTAMPTZ,
  usado_por TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT esterilizacao_pacotes_codigo UNIQUE (codigo),
  CONSTRAINT esterilizacao_pacotes_sequencia UNIQUE (ciclo_id, sequencia)
);

-- A pergunta do atendimento é "quais pacotes este paciente recebeu".
CREATE INDEX IF NOT EXISTS idx_esterilizacao_pacotes_paciente
  ON public.esterilizacao_pacotes (patient_id, usado_em DESC)
  WHERE patient_id IS NOT NULL;

-- E a pergunta do recall é "quem recebeu pacote deste ciclo".
CREATE INDEX IF NOT EXISTS idx_esterilizacao_pacotes_ciclo
  ON public.esterilizacao_pacotes (ciclo_id, sequencia);

ALTER TABLE public.esterilizacao_pacotes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "esterilizacao_pacotes_all" ON public.esterilizacao_pacotes;
CREATE POLICY "esterilizacao_pacotes_all" ON public.esterilizacao_pacotes
  FOR ALL USING (true) WITH CHECK (true);

/*
 * Garante que o ciclo tenha pelo menos `p_quantidade` pacotes.
 *
 * Idempotente porque a reimpressão é normal: faltou etiqueta no meio da
 * embalagem, ela manda imprimir mais três do mesmo ciclo, e esses três são
 * pacotes novos — os anteriores continuam valendo com os mesmos códigos.
 */
CREATE OR REPLACE FUNCTION public.garantir_pacotes_do_ciclo(
  p_ciclo_id UUID,
  p_quantidade INT
)
RETURNS SETOF public.esterilizacao_pacotes
LANGUAGE plpgsql
AS $$
DECLARE
  v_lote TEXT;
  v_existentes INT;
BEGIN
  SELECT lote INTO v_lote FROM public.esterilizacao_ciclos WHERE id = p_ciclo_id;
  IF v_lote IS NULL THEN
    RAISE EXCEPTION 'Ciclo % não encontrado', p_ciclo_id;
  END IF;

  SELECT COUNT(*) INTO v_existentes
  FROM public.esterilizacao_pacotes WHERE ciclo_id = p_ciclo_id;

  IF p_quantidade > v_existentes THEN
    INSERT INTO public.esterilizacao_pacotes (ciclo_id, sequencia, codigo)
    SELECT p_ciclo_id, s, v_lote || '-' || LPAD(s::TEXT, 2, '0')
    FROM generate_series(v_existentes + 1, p_quantidade) AS s;
  END IF;

  RETURN QUERY
  SELECT * FROM public.esterilizacao_pacotes
  WHERE ciclo_id = p_ciclo_id
  ORDER BY sequencia;
END;
$$;

/*
 * Registra que um pacote foi usado num paciente.
 *
 * Recusa pacote de carga não liberada. Um ciclo com integrador não conforme ou
 * biológico positivo não deveria ter saído do estoque, e o momento de descobrir
 * isso é antes de abrir o pacote na cadeira — não na auditoria.
 */
CREATE OR REPLACE FUNCTION public.usar_pacote_esterilizacao(
  p_codigo TEXT,
  p_patient_id UUID,
  p_por TEXT DEFAULT NULL
)
RETURNS public.esterilizacao_pacotes
LANGUAGE plpgsql
AS $$
DECLARE
  v_pacote public.esterilizacao_pacotes;
  v_ciclo public.esterilizacao_ciclos;
BEGIN
  SELECT * INTO v_pacote FROM public.esterilizacao_pacotes
  WHERE codigo = UPPER(TRIM(p_codigo));

  IF v_pacote.id IS NULL THEN
    RAISE EXCEPTION 'Pacote % não encontrado', p_codigo;
  END IF;

  SELECT * INTO v_ciclo FROM public.esterilizacao_ciclos WHERE id = v_pacote.ciclo_id;

  IF v_ciclo.integrador_quimico = 'nao_conforme' OR v_ciclo.indicador_biologico = 'positivo' THEN
    RAISE EXCEPTION 'Ciclo % reprovado: reprocesse este pacote em vez de usar', v_ciclo.lote;
  END IF;

  UPDATE public.esterilizacao_pacotes
  SET patient_id = p_patient_id,
      usado_em = NOW(),
      usado_por = NULLIF(TRIM(COALESCE(p_por, '')), '')
  WHERE id = v_pacote.id
  RETURNING * INTO v_pacote;

  RETURN v_pacote;
END;
$$;
