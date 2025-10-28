# ⚠️ INSTRUÇÕES IMPORTANTES - APLICAR NO SUPABASE

## 🔧 Execute este SQL no SQL Editor do Supabase para corrigir o sistema de pastas:

```sql
-- 1. Criar tabela de pastas se não existir
CREATE TABLE IF NOT EXISTS folders (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Adicionar coluna folder_id na tabela photos se não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'folder_id') THEN
        ALTER TABLE photos ADD COLUMN folder_id UUID REFERENCES folders(id) ON DELETE SET NULL;
    END IF;
END $$;

-- 3. Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_photos_folder_id ON photos(folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_patient_id ON folders(patient_id);

-- 4. Habilitar RLS na tabela folders
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;

-- 5. Criar políticas RLS para pastas
CREATE POLICY "Enable read access for all users" ON folders FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON folders FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON folders FOR UPDATE USING (true);
CREATE POLICY "Enable delete access for all users" ON folders FOR DELETE USING (true);
```

## ✅ Após executar o SQL acima:

1. **As fotos serão organizadas automaticamente em pastas por data**
2. **Cada pasta terá nome no formato "Pasta DD/MM/YYYY"**  
3. **As fotos aparecerão organizadas no perfil d1- mosra duaso paciente**
4. **O sistema de cache garantirá navegação instantânea**

## 🔍 Para verificar se funcionou:

Execute no SQL Editor para ver as tabelas:
```sql
-- Verificar se as tabelas foram criadas
SELECT table_name FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('patients', 'photos', 'folders');

-- Verificar estrutura da tabela photos
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'photos';
```

## 📋 O que foi corrigido:

- ✅ **Sistema de pastas automáticas por data**
- ✅ **TanStack Query para navegação instantânea**  
- ✅ **Hooks otimizados para fotos e pastas**
- ✅ **Cache inteligente com prefetching**
- ✅ **Loading states instantâneos**