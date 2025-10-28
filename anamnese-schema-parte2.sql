-- PARTE 2: Criar índices
CREATE INDEX IF NOT EXISTS idx_anamneses_patient_id ON anamneses(patient_id);
CREATE INDEX IF NOT EXISTS idx_anamneses_created_at ON anamneses(created_at DESC);
