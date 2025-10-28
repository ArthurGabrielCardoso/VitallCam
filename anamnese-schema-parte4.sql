-- PARTE 4: Habilitar RLS e criar política
ALTER TABLE anamneses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acesso total para todos"
  ON anamneses
  FOR ALL
  USING (true)
  WITH CHECK (true);
