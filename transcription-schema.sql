-- Criar tabela de transcrições
CREATE TABLE IF NOT EXISTS transcriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  started_at TIMESTAMP WITH TIME ZONE NOT NULL,
  ended_at TIMESTAMP WITH TIME ZONE,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'error')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_transcriptions_patient_id ON transcriptions(patient_id);
CREATE INDEX IF NOT EXISTS idx_transcriptions_created_at ON transcriptions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transcriptions_status ON transcriptions(status);

-- Habilitar Row Level Security
ALTER TABLE transcriptions ENABLE ROW LEVEL SECURITY;

-- Criar políticas para acesso público
CREATE POLICY "Enable read access for all users" ON transcriptions FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON transcriptions FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON transcriptions FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON transcriptions FOR DELETE USING (true);

-- Criar tabela de segmentos de transcrição (para armazenar chunks em tempo real)
CREATE TABLE IF NOT EXISTS transcription_segments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  transcription_id UUID NOT NULL REFERENCES transcriptions(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  timestamp_start REAL NOT NULL,
  timestamp_end REAL NOT NULL,
  confidence REAL,
  speaker TEXT,
  sequence_number INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices para segmentos
CREATE INDEX IF NOT EXISTS idx_segments_transcription_id ON transcription_segments(transcription_id);
CREATE INDEX IF NOT EXISTS idx_segments_sequence ON transcription_segments(transcription_id, sequence_number);

-- Habilitar RLS para segmentos
ALTER TABLE transcription_segments ENABLE ROW LEVEL SECURITY;

-- Políticas para segmentos
CREATE POLICY "Enable read access for all users" ON transcription_segments FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON transcription_segments FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON transcription_segments FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON transcription_segments FOR DELETE USING (true);
