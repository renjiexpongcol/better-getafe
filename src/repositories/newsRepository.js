import { getCmsPool } from '../services/cloudSql.js';
import { getLocalDb, saveLocalDb, isGcp, id, slugify, now } from './localDb.js';
import { getCategories } from './categoryRepository.js';

export async function getNewsArticles() {
  if (isGcp()) {
    const pool = await getCmsPool();
    const [rows] = await pool.execute('SELECT * FROM news');
    return rows;
  } else {
    const db = await getLocalDb();
    return db.news;
  }
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
    published_at: b.status === "published" ? (b.published_at || created) : null,
    created_at: created,
    updated_at: created,
  };

  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute(
      "INSERT INTO news (id, title, slug, excerpt, content, featured_image, category_id, author_id, status, published_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      [article.id, article.title, article.slug, article.excerpt, article.content, article.featured_image, article.category_id, article.author_id, article.status, article.published_at, article.created_at, article.updated_at]
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
  const newPublishedAt = newStatus === "published" ? (b.published_at || existing.published_at || updated) : null;

  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute(
      "UPDATE news SET title=?, slug=?, excerpt=?, content=?, featured_image=?, category_id=?, status=?, published_at=?, updated_at=? WHERE id=?",
      [b.title.trim(), finalSlug, b.excerpt.trim(), b.content.trim(), b.featured_image || "", b.category_id || null, newStatus, newPublishedAt, updated, articleId]
    );
  } else {
    const db = await getLocalDb();
    const index = db.news.findIndex(n => n.id === articleId);
    db.news[index] = { 
      ...existing, 
      title: b.title.trim(), slug: finalSlug, excerpt: b.excerpt.trim(), content: b.content.trim(),
      featured_image: b.featured_image || "", category_id: b.category_id || null,
      status: newStatus, published_at: newPublishedAt, updated_at: updated 
    };
    await saveLocalDb(db);
  }

  return { ...existing, title: b.title.trim(), slug: finalSlug, excerpt: b.excerpt.trim(), content: b.content.trim(), featured_image: b.featured_image || "", category_id: b.category_id || null, status: newStatus, published_at: newPublishedAt, updated_at: updated };
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
