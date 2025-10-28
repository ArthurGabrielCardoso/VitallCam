-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create patients table
CREATE TABLE IF NOT EXISTS patients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar tabela de pastas
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create photos table
CREATE TABLE IF NOT EXISTS photos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  image_data TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
  image_number INTEGER
);

-- Migração: Adicionar coluna folder_id se não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'folder_id') THEN
        ALTER TABLE photos ADD COLUMN folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Migração: Adicionar coluna image_number se não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'image_number') THEN
        ALTER TABLE photos ADD COLUMN image_number INTEGER;
    END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_photos_patient_id ON photos(patient_id);
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON photos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_photos_folder_id ON photos(folder_id);
CREATE INDEX IF NOT EXISTS idx_photos_image_number ON photos(image_number);
CREATE INDEX IF NOT EXISTS idx_patients_created_at ON patients(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_folders_patient_id ON folders(patient_id);

-- Enable Row Level Security (RLS)
ALTER TABLE patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (adjust as needed for production)
CREATE POLICY "Enable read access for all users" ON patients FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON patients FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON patients FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON patients FOR DELETE USING (true);

CREATE POLICY "Enable read access for all users" ON photos FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON photos FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON photos FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON photos FOR DELETE USING (true);

-- Políticas RLS para pastas
CREATE POLICY "Enable read access for all users" ON folders FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON folders FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON folders FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON folders FOR DELETE USING (true);