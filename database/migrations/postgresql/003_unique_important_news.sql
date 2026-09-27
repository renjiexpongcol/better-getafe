-- Keep the important-announcement invariant true for existing and future data.
-- Normalize legacy duplicates before creating the unique partial index.
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY updated_at DESC, created_at DESC, id) AS position
  FROM news
  WHERE is_important = TRUE
)
UPDATE news
SET is_important = FALSE
FROM ranked
WHERE news.id = ranked.id AND ranked.position > 1;

CREATE UNIQUE INDEX IF NOT EXISTS news_single_important_idx
  ON news (is_important)
  WHERE is_important = TRUE;
