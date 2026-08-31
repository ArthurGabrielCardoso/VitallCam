-- Rastreabilidade dos ciclos de esterilização (RDC Anvisa 1.002/2025).
--
-- O art. 81 exige que cada pacote esterilizado possa ser ligado ao ciclo que o
-- processou: data, número do ciclo/lote, responsável e identificação do
-- equipamento. A norma não obriga sistema digital — livro de CME escrito à mão
-- vale — mas quem digita o lote à mão erra, e a etiqueta impressa é o que a
-- Vigilância olha primeiro. Esta tabela é a fonte do número: o app não inventa
-- contagem no dispositivo, senão dois tablets abrem o "ciclo 01" no mesmo dia.
--
-- Uma linha por ciclo (não por etiqueta): as 20 etiquetas de um mesmo ciclo
-- carregam o mesmo lote, que é justamente o que as torna rastreáveis.

CREATE TABLE IF NOT EXISTS public.esterilizacao_ciclos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Data local da clínica, não UTC: um ciclo das 21h é do dia 31, e em UTC já
  -- seria dia 1º — o número do ciclo reiniciaria no meio da noite de trabalho.
  data DATE NOT NULL,
  -- Sequencial dentro do dia: 01 no primeiro ciclo, 02 no segundo.
  numero INT NOT NULL,
  -- Código impresso na etiqueta, no formato MMDD-NN (ex.: 0831-01).
  lote TEXT NOT NULL,
  -- Validade do pacote. Três meses é o padrão da clínica; embalagem íntegra e
  -- bem guardada mantém a esterilidade, mas prazo curto força a recirculação.
  validade DATE NOT NULL,
  responsavel TEXT NOT NULL,
  -- A norma pede a identificação do equipamento; a clínica tem a Autoclave 01.
  autoclave TEXT,
  -- Quantas etiquetas foram pedidas na abertura. Reimpressão não altera:
  -- o que interessa na auditoria é o ciclo, não a contagem de adesivos.
  quantidade_etiquetas INT NOT NULL DEFAULT 1,
  -- O que foi embalado ("kit exame", "fórceps"), quando ela quiser anotar.
  conteudo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Dois pacotes com o mesmo lote no mesmo dia quebrariam a rastreabilidade
  -- inteira: é a garantia de que o número do ciclo é único.
  CONSTRAINT esterilizacao_ciclos_dia_numero UNIQUE (data, numero)
);

-- A tela abre sempre nos ciclos mais recentes, agrupados por data.
CREATE INDEX IF NOT EXISTS idx_esterilizacao_ciclos_data
  ON public.esterilizacao_ciclos (data DESC, numero DESC);

ALTER TABLE public.esterilizacao_ciclos ENABLE ROW LEVEL SECURITY;

-- Mesma política das demais tabelas do app (acesso pela anon key do cliente).
DROP POLICY IF EXISTS "esterilizacao_ciclos_all" ON public.esterilizacao_ciclos;
CREATE POLICY "esterilizacao_ciclos_all" ON public.esterilizacao_ciclos
  FOR ALL USING (true) WITH CHECK (true);

/*
 * Abre o próximo ciclo do dia e devolve a linha criada.
 *
 * Tudo tem padrão: sem parâmetro nenhum sai o ciclo de hoje, validade em três
 * meses, Autoclave 01 e a responsável técnica — que é o caminho de um clique.
 * Os parâmetros existem para a tela de edição, quando o ciclo é de ontem ou o
 * material vence antes.
 *
 * O número sai de um MAX + 1, que sozinho é uma corrida clássica: dois tablets
 * lendo "01" ao mesmo tempo pedem o mesmo "02" e um dos dois leva erro de chave
 * única na cara de quem está com a autoclave aberta. O advisory lock por dia
 * serializa só quem abre ciclo naquela data — quem imprime em outro dia não
 * espera ninguém, e o lock cai sozinho no fim da transação.
 */
CREATE OR REPLACE FUNCTION public.abrir_ciclo_esterilizacao(
  p_responsavel TEXT DEFAULT 'Jéssica Pádua',
  p_autoclave TEXT DEFAULT 'Autoclave 01',
  p_quantidade INT DEFAULT 1,
  p_conteudo TEXT DEFAULT NULL,
  p_data DATE DEFAULT NULL,
  p_validade DATE DEFAULT NULL
)
RETURNS public.esterilizacao_ciclos
LANGUAGE plpgsql
AS $$
DECLARE
  v_data DATE := COALESCE(p_data, (NOW() AT TIME ZONE 'America/Sao_Paulo')::DATE);
  v_numero INT;
  v_linha public.esterilizacao_ciclos;
BEGIN
  IF COALESCE(TRIM(p_responsavel), '') = '' THEN
    RAISE EXCEPTION 'Responsável pelo ciclo é obrigatório (RDC 1.002/2025, art. 81)';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('esterilizacao_ciclos:' || v_data::TEXT));

  SELECT COALESCE(MAX(numero), 0) + 1 INTO v_numero
  FROM public.esterilizacao_ciclos
  WHERE data = v_data;

  INSERT INTO public.esterilizacao_ciclos
    (data, numero, lote, validade, responsavel, autoclave, quantidade_etiquetas, conteudo)
  VALUES (
    v_data,
    v_numero,
    TO_CHAR(v_data, 'MMDD') || '-' || LPAD(v_numero::TEXT, 2, '0'),
    COALESCE(p_validade, v_data + INTERVAL '3 months'),
    TRIM(p_responsavel),
    NULLIF(TRIM(COALESCE(p_autoclave, '')), ''),
    GREATEST(COALESCE(p_quantidade, 1), 1),
    NULLIF(TRIM(COALESCE(p_conteudo, '')), '')
  )
  RETURNING * INTO v_linha;

  RETURN v_linha;
END;
$$;
