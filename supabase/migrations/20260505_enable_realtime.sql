-- Habilita Realtime (Postgres Changes) para as tabelas photos e folders
-- Necessário para que inserções apareçam automaticamente em outros dispositivos

ALTER PUBLICATION supabase_realtime ADD TABLE photos;
ALTER PUBLICATION supabase_realtime ADD TABLE folders;
