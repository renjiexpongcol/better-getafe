import { getCmsPool } from '../services/cloudSql.js';
import { getLocalDb, saveLocalDb, isGcp, id, slugify, now } from './localDb.js';
import { getCategories } from './categoryRepository.js';

const truthy = (value) => value === true || value === 1;
const contentFields = (body, existing = {}) => ({
  content_type: ['news', 'event', 'meeting'].includes(body.content_type) ? body.content_type : (existing.content_type || 'news'),
  event_start_at: body.event_start_at || null,
  event_end_at: body.event_end_at || null,
  show_in_news: body.show_in_news === undefined ? (existing.show_in_news === undefined ? true : truthy(existing.show_in_news)) : body.show_in_news === true,
  show_in_upcoming: body.show_in_upcoming === undefined ? truthy(existing.show_in_upcoming) : body.show_in_upcoming === true,
  show_in_events: body.show_in_events === undefined ? truthy(existing.show_in_events) : body.show_in_events === true,
  show_on_homepage: body.show_on_homepage === undefined ? (existing.show_on_homepage === undefined ? true : truthy(existing.show_on_homepage)) : body.show_on_homepage === true,
});

export async function getNewsArticles() {
  let rows;
  if (isGcp()) {
    const pool = await getCmsPool();
    [rows] = await pool.execute('SELECT * FROM news');
  } else {
    const db = await getLocalDb();
    rows = db.news;
  }
  const categories = await getCategories();
  return rows.map((article) => {
    const category = categories.find((item) => item.id === article.category_id);
    const legacyEvent = category && ['event', 'events'].includes(String(category.slug || category.name).toLowerCase());
    return {
      ...article,
      content_type: article.content_type || (legacyEvent ? 'event' : 'news'),
      event_start_at: article.event_start_at || (legacyEvent ? article.published_at : null),
      event_end_at: article.event_end_at || null,
      show_in_news: article.show_in_news === undefined ? !legacyEvent : truthy(article.show_in_news),
      show_in_upcoming: article.show_in_upcoming === undefined ? legacyEvent : truthy(article.show_in_upcoming),
      show_in_events: article.show_in_events === undefined ? legacyEvent : truthy(article.show_in_events),
      show_on_homepage: article.show_on_homepage === undefined ? true : truthy(article.show_on_homepage),
    };
  });
}

export async function getNewsArticleBySlug(slug) {
  const articles = await getNewsArticles();
  return articles.find(n => n.slug === slug) || null;
}

export async function createNewsArticle(b, author_id) {
  const created = now();
  const allNews = await getNewsArticles();
  
  let baseSlug = slugify(b.slug || b.title) || "untitled";
  let finalSlug = baseSlug;
  let n = 2;
  while (allNews.some((x) => x.slug === finalSlug)) {
    finalSlug = `${baseSlug}-${n++}`;
  }

  const article = {
    id: id(),
    title: b.title.trim(),
    slug: finalSlug,
    excerpt: b.excerpt.trim(),
    content: b.content.trim(),
    featured_image: b.featured_image || "",
    category_id: b.category_id || null,
    author_id,
    status: b.status === "published" ? "published" : "draft",
    is_important: b.is_important === true,
    ...contentFields(b),
    published_at: b.status === "published" ? (b.published_at || created) : null,
    created_at: created,
    updated_at: created,
  };

  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute(
      "INSERT INTO news (id, title, slug, excerpt, content, featured_image, category_id, author_id, status, published_at, created_at, updated_at, is_important, content_type, event_start_at, event_end_at, show_in_news, show_in_upcoming, show_in_events, show_on_homepage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [article.id, article.title, article.slug, article.excerpt, article.content, article.featured_image, article.category_id, article.author_id, article.status, article.published_at, article.created_at, article.updated_at, article.is_important, article.content_type, article.event_start_at, article.event_end_at, article.show_in_news, article.show_in_upcoming, article.show_in_events, article.show_on_homepage]
    );
  } else {
    const db = await getLocalDb();
    db.news.push(article);
    await saveLocalDb(db);
  }

  return article;
}

export async function updateNewsArticle(articleId, b) {
  const allNews = await getNewsArticles();
  const existing = allNews.find(n => n.id === articleId);
  if (!existing) return null;

  let baseSlug = slugify(b.slug || b.title) || "untitled";
  let finalSlug = baseSlug;
  let n = 2;
  while (allNews.some((x) => x.slug === finalSlug && x.id !== articleId)) {
    finalSlug = `${baseSlug}-${n++}`;
  }
  
  const updated = now();
  const newStatus = b.status === "published" ? "published" : "draft";
  const important = b.is_important === undefined ? Boolean(existing.is_important) : b.is_important === true;
  const placement = contentFields(b, existing);
  const newPublishedAt = newStatus === "published" ? (b.published_at || existing.published_at || updated) : null;

  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute(
      "UPDATE news SET title=?, slug=?, excerpt=?, content=?, featured_image=?, category_id=?, status=?, published_at=?, updated_at=?, is_important=?, content_type=?, event_start_at=?, event_end_at=?, show_in_news=?, show_in_upcoming=?, show_in_events=?, show_on_homepage=? WHERE id=?",
      [b.title.trim(), finalSlug, b.excerpt.trim(), b.content.trim(), b.featured_image || "", b.category_id || null, newStatus, newPublishedAt, updated, important, placement.content_type, placement.event_start_at, placement.event_end_at, placement.show_in_news, placement.show_in_upcoming, placement.show_in_events, placement.show_on_homepage, articleId]
    );
  } else {
    const db = await getLocalDb();
    const index = db.news.findIndex(n => n.id === articleId);
    db.news[index] = { 
      ...existing, 
      title: b.title.trim(), slug: finalSlug, excerpt: b.excerpt.trim(), content: b.content.trim(),
      featured_image: b.featured_image || "", category_id: b.category_id || null,
      status: newStatus, published_at: newPublishedAt, updated_at: updated, is_important: important, ...placement
    };
    await saveLocalDb(db);
  }

  return { ...existing, title: b.title.trim(), slug: finalSlug, excerpt: b.excerpt.trim(), content: b.content.trim(), featured_image: b.featured_image || "", category_id: b.category_id || null, status: newStatus, published_at: newPublishedAt, updated_at: updated, is_important: important, ...placement };
}

export async function deleteNewsArticle(articleId) {
  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute("DELETE FROM news WHERE id=?", [articleId]);
  } else {
    const db = await getLocalDb();
    const index = db.news.findIndex(n => n.id === articleId);
    if (index >= 0) {
      db.news.splice(index, 1);
      await saveLocalDb(db);
    }
  }
}

export async function bulkUpdateNewsArticles(articleIds, action) {
  const ids = [...new Set((articleIds || []).filter(Boolean))];
  if (!ids.length) return 0;

  if (isGcp()) {
    const pool = await getCmsPool();
    const placeholders = ids.map(() => '?').join(',');
    if (action === 'delete') {
      const [result] = await pool.execute(`DELETE FROM news WHERE id IN (${placeholders})`, ids);
      return result.affectedRows || 0;
    }
    if (!['published', 'draft'].includes(action)) throw new Error('Unsupported bulk action');
    const publishedAt = action === 'published' ? now() : null;
    const [result] = await pool.execute(`UPDATE news SET status=?, published_at=?, updated_at=? WHERE id IN (${placeholders})`, [action, publishedAt, now(), ...ids]);
    return result.affectedRows || 0;
  }

  const db = await getLocalDb();
  const selected = new Set(ids);
  const before = db.news.length;
  if (action === 'delete') db.news = db.news.filter((article) => !selected.has(article.id));
  else if (['published', 'draft'].includes(action)) {
    const updated = now();
    db.news = db.news.map((article) => selected.has(article.id)
      ? { ...article, status: action, published_at: action === 'published' ? (article.published_at || updated) : null, updated_at: updated }
      : article);
  } else throw new Error('Unsupported bulk action');
  await saveLocalDb(db);
  return action === 'delete' ? before - db.news.length : ids.filter((id) => before !== db.news.length && selected.has(id)).length;
}
