-- PARTE 3: Criar trigger para updated_at
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
