CREATE TABLE IF NOT EXISTS public.anamnese_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_anamnese_templates_active
  ON public.anamnese_templates (is_active, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_anamnese_templates_one_default
  ON public.anamnese_templates (is_default)
  WHERE is_default = TRUE;

ALTER TABLE public.anamneses
  ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES public.anamnese_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS template_name TEXT,
  ADD COLUMN IF NOT EXISTS template_snapshot JSONB;

CREATE OR REPLACE FUNCTION public.update_anamnese_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_anamnese_templates_updated_at ON public.anamnese_templates;
CREATE TRIGGER trigger_update_anamnese_templates_updated_at
  BEFORE UPDATE ON public.anamnese_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_anamnese_templates_updated_at();

ALTER TABLE public.anamnese_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso aos modelos de anamnese" ON public.anamnese_templates;
CREATE POLICY "Acesso aos modelos de anamnese"
  ON public.anamnese_templates
  FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.anamnese_templates;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

