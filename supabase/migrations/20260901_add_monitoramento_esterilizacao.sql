-- Monitoramento do ciclo: o que a fiscalização realmente pede.
--
-- A RDC 1.002/2025 não se satisfaz com a etiqueta. Numa inspeção, o fiscal pega
-- um pacote qualquer do estoque, lê o lote na etiqueta e pede o registro daquele
-- dia e ciclo — para conferir se o teste biológico foi feito e se deu negativo.
-- Sem estas colunas o lote leva a um registro que não responde a pergunta.
--
-- O que a norma exige e passa a caber aqui:
--   * integrador químico classe 5 ou 6 em pacote-teste a cada ciclo;
--   * indicador biológico semanal, no primeiro ciclo do dia programado;
--   * registro formal de todos os resultados, para auditoria.

ALTER TABLE public.esterilizacao_ciclos
  -- 'conforme' | 'nao_conforme'. Nulo = ciclo ainda não conferido.
  ADD COLUMN IF NOT EXISTS integrador_quimico TEXT,
  -- 'negativo' (aprovado) | 'positivo' (falhou). Nulo = não foi feito neste
  -- ciclo, que é o normal: a norma pede semanal, não diário.
  ADD COLUMN IF NOT EXISTS indicador_biologico TEXT,
  -- Monitoramento físico do ciclo, como mostrado no painel da autoclave.
  ADD COLUMN IF NOT EXISTS temperatura INT,
  ADD COLUMN IF NOT EXISTS duracao_minutos INT,
  -- Liberação da carga: quem conferiu os indicadores e liberou para uso.
  -- Sem isso o registro diz o que aconteceu mas não quem respondeu por ele.
  ADD COLUMN IF NOT EXISTS liberado_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS liberado_por TEXT,
  ADD COLUMN IF NOT EXISTS observacao TEXT;

-- "Quando foi o último biológico?" é a pergunta que decide se a clínica está em
-- dia com a norma, e ela roda toda vez que a tela abre. Índice parcial: só as
-- linhas que têm biológico entram, então ele não cresce com o histórico todo.
CREATE INDEX IF NOT EXISTS idx_esterilizacao_ultimo_biologico
  ON public.esterilizacao_ciclos (data DESC)
  WHERE indicador_biologico IS NOT NULL;

-- A busca do fiscal é pelo lote impresso no pacote, e ele não sabe a data.
CREATE INDEX IF NOT EXISTS idx_esterilizacao_lote
  ON public.esterilizacao_ciclos (lote);

/*
 * Registra o resultado do ciclo e, quando os indicadores estão conformes,
 * libera a carga.
 *
 * A liberação é gravada junto com o resultado, não em outro momento: separar as
 * duas coisas abre espaço para uma carga marcada como conforme e nunca liberada
 * — ou, pior, liberada sem ninguém ter olhado o integrador.
 */
CREATE OR REPLACE FUNCTION public.registrar_monitoramento_ciclo(
  p_id UUID,
  p_integrador TEXT,
  p_biologico TEXT DEFAULT NULL,
  p_temperatura INT DEFAULT NULL,
  p_duracao INT DEFAULT NULL,
  p_observacao TEXT DEFAULT NULL,
  p_por TEXT DEFAULT NULL
)
RETURNS public.esterilizacao_ciclos
LANGUAGE plpgsql
AS $$
DECLARE
  v_linha public.esterilizacao_ciclos;
  v_aprovado BOOLEAN;
BEGIN
  IF p_integrador NOT IN ('conforme', 'nao_conforme') THEN
    RAISE EXCEPTION 'Resultado do integrador químico inválido: %', p_integrador;
  END IF;
  IF p_biologico IS NOT NULL AND p_biologico NOT IN ('negativo', 'positivo') THEN
    RAISE EXCEPTION 'Resultado do indicador biológico inválido: %', p_biologico;
  END IF;

  -- Carga só sai para uso com integrador conforme e, se houve biológico no
  -- ciclo, com ele negativo. Biológico positivo significa esterilização falha:
  -- a carga volta para o reprocessamento, não para a boca do paciente.
  v_aprovado := p_integrador = 'conforme'
    AND (p_biologico IS NULL OR p_biologico = 'negativo');

  UPDATE public.esterilizacao_ciclos
  SET integrador_quimico = p_integrador,
      indicador_biologico = p_biologico,
      temperatura = COALESCE(p_temperatura, temperatura),
      duracao_minutos = COALESCE(p_duracao, duracao_minutos),
      observacao = NULLIF(TRIM(COALESCE(p_observacao, '')), ''),
      liberado_em = CASE WHEN v_aprovado THEN NOW() ELSE NULL END,
      liberado_por = CASE WHEN v_aprovado THEN NULLIF(TRIM(COALESCE(p_por, '')), '') ELSE NULL END
  WHERE id = p_id
  RETURNING * INTO v_linha;

  IF v_linha.id IS NULL THEN
    RAISE EXCEPTION 'Ciclo % não encontrado', p_id;
  END IF;

  RETURN v_linha;
END;
$$;
