-- Via assinada do contrato: o papel volta pro prontuário.
--
-- O contrato sai impresso, o paciente assina de próprio punho e a secretária
-- escaneia na multifuncional. O original em papel continua guardado (a Lei
-- 13.787/2018 exige 20 anos do último registro, e destruir antes disso pediria
-- certificado ICP-Brasil e comissão formal); o que muda é que ninguém precisa
-- mais abrir a caixa pra achar um termo de dois anos atrás.

ALTER TABLE public.contratos_emitidos
  -- Chave do PDF no R2. NULO = ainda não voltou assinado. É daqui que sai a
  -- lista de pendências: sem coluna de status nem enum pra manter em sincronia.
  ADD COLUMN IF NOT EXISTS via_assinada_key TEXT,
  ADD COLUMN IF NOT EXISTS via_assinada_paginas INT,
  ADD COLUMN IF NOT EXISTS via_assinada_em TIMESTAMPTZ,
  -- Quando a cópia digitalizada foi mandada pro paciente.
  ADD COLUMN IF NOT EXISTS enviado_paciente_em TIMESTAMPTZ;

-- A consulta de pendências é sempre "sem via assinada, mais antigos primeiro":
-- índice parcial cobre exatamente ela e não cresce com o histórico já resolvido.
CREATE INDEX IF NOT EXISTS idx_contratos_emitidos_sem_via
  ON public.contratos_emitidos (created_at)
  WHERE via_assinada_key IS NULL;

-- Nenhuma coluna é NOT NULL: os contratos já impressos antes desta migration
-- continuam válidos, apenas aparecem como pendentes — que é a verdade.
