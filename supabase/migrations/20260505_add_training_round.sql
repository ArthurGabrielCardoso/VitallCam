-- Marks photos used in YOLO training rounds.
-- NULL = never used; 1, 2, 3... = round number.
ALTER TABLE photos
  ADD COLUMN IF NOT EXISTS training_round INTEGER;

CREATE INDEX IF NOT EXISTS idx_photos_training_round
  ON photos(training_round);
