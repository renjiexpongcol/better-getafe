-- Unify news, events, and meetings under the existing news content table.
ALTER TABLE news
  ADD COLUMN content_type ENUM('news', 'event', 'meeting') NOT NULL DEFAULT 'news' AFTER is_important,
  ADD COLUMN event_start_at DATETIME(3) NULL AFTER content_type,
  ADD COLUMN event_end_at DATETIME(3) NULL AFTER event_start_at,
  ADD COLUMN show_in_news BOOLEAN NOT NULL DEFAULT TRUE AFTER event_end_at,
  ADD COLUMN show_in_upcoming BOOLEAN NOT NULL DEFAULT FALSE AFTER show_in_news,
  ADD COLUMN show_in_events BOOLEAN NOT NULL DEFAULT FALSE AFTER show_in_upcoming,
  ADD COLUMN show_on_homepage BOOLEAN NOT NULL DEFAULT TRUE AFTER show_in_events,
  ADD INDEX news_display_idx (show_in_news, show_in_upcoming, show_in_events, event_start_at);

-- Preserve current event-category behavior while moving it to explicit fields.
UPDATE news n
JOIN categories c ON c.id = n.category_id
SET n.content_type = 'event',
    n.event_start_at = COALESCE(n.event_start_at, n.published_at),
    n.show_in_upcoming = TRUE,
    n.show_in_events = TRUE,
    n.show_in_news = FALSE
WHERE LOWER(c.slug) = 'events' OR LOWER(c.name) = 'events';
