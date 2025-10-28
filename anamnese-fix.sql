-- PASSO 1: Remover tabela antiga (se existir)
DROP TABLE IF EXISTS anamneses CASCADE;

-- PASSO 2: Criar tabela nova
CREATE TABLE anamneses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  endereco TEXT,
  telefone TEXT,
  telefone_auxiliar TEXT,
  email TEXT,
  instagram TEXT,
  dados_saude JSONB NOT NULL DEFAULT '{}'::jsonb,
  assinatura TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- PASSO 3: Criar índices
CREATE INDEX idx_anamneses_patient_id ON anamneses(patient_id);
CREATE INDEX idx_anamneses_created_at ON anamneses(created_at DESC);

-- PASSO 4: Criar função e trigger
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

-- PASSO 5: Habilitar RLS
ALTER TABLE anamneses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acesso total para todos"
  ON anamneses
  FOR ALL
  USING (true)
  WITH CHECK (true);
