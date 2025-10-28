-- Migração: Adicionar coluna image_number se não existir
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'photos' AND column_name = 'image_number') THEN
        ALTER TABLE photos ADD COLUMN image_number INTEGER;
        CREATE INDEX IF NOT EXISTS idx_photos_image_number ON photos(image_number);
    END IF;
END $$;