-- Tabela de Anamnese
-- Armazena dados de anamnese dos pacientes em formato de texto

CREATE TABLE IF NOT EXISTS anamneses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,

  -- Dados pessoais
  nome TEXT NOT NULL,
  endereco TEXT,
  telefone TEXT,
  telefone_auxiliar TEXT,
  email TEXT,
  instagram TEXT,

  -- Dados de saúde (armazenados como JSONB para flexibilidade)
  dados_saude JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Assinatura (armazenada como base64 data URL)
  assinatura TEXT,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_anamneses_patient_id ON anamneses(patient_id);
CREATE INDEX IF NOT EXISTS idx_anamneses_created_at ON anamneses(created_at DESC);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_anamneses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_anamneses_updated_at
  BEFORE UPDATE ON anamneses
  FOR EACH ROW
  EXECUTE FUNCTION update_anamneses_updated_at();

-- RLS (Row Level Security) - Opcional
ALTER TABLE anamneses ENABLE ROW LEVEL SECURITY;

-- Política de acesso - ajuste conforme suas necessidades de autenticação
CREATE POLICY "Permitir acesso total para todos (desenvolvimento)"
  ON anamneses
  FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE anamneses IS 'Armazena dados de anamnese dos pacientes em formato texto';
COMMENT ON COLUMN anamneses.dados_saude IS 'JSONB contendo todas as respostas do formulário de anamnese';
COMMENT ON COLUMN anamneses.assinatura IS 'Assinatura digital do paciente em formato base64 data URL';
