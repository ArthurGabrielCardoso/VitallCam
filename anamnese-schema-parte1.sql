-- PARTE 1: Criar a tabela
CREATE TABLE IF NOT EXISTS anamneses (
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
