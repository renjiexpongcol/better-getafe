import { getCmsPool } from '../services/cloudSql.js';
import { getLocalDb, saveLocalDb, isGcp, id, slugify, now } from './localDb.js';

export async function getCategories() {
  if (isGcp()) {
    const pool = await getCmsPool();
    const [rows] = await pool.execute('SELECT * FROM categories');
    return rows;
  } else {
    const db = await getLocalDb();
    return db.categories;
  }
}

export async function getCategoryById(categoryId) {
  if (isGcp()) {
    const pool = await getCmsPool();
    const [rows] = await pool.execute('SELECT * FROM categories WHERE id = ?', [categoryId]);
    return rows[0] || null;
  } else {
    const db = await getLocalDb();
    return db.categories.find(c => c.id === categoryId) || null;
  }
}

export async function createCategory(name, customSlug = null) {
  const created = now();
  const newId = id();
  const allCategories = await getCategories();
  
  let baseSlug = slugify(customSlug || name) || "untitled";
  let finalSlug = baseSlug;
  let n = 2;
  while (allCategories.some((x) => x.slug === finalSlug)) {
    finalSlug = `${baseSlug}-${n++}`;
  }

  const item = {
    id: newId,
    name,
    slug: finalSlug,
    created_at: created,
    updated_at: created,
  };

  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute(
      "INSERT INTO categories (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      [item.id, item.name, item.slug, item.created_at, item.updated_at]
    );
  } else {
    const db = await getLocalDb();
    db.categories.push(item);
    await saveLocalDb(db);
  }

  return item;
}

export async function updateCategory(categoryId, name, customSlug = null) {
  const allCategories = await getCategories();
  const existing = allCategories.find(c => c.id === categoryId);
  if (!existing) return null;

  let baseSlug = slugify(customSlug || name) || "untitled";
  let finalSlug = baseSlug;
  let n = 2;
  while (allCategories.some((x) => x.slug === finalSlug && x.id !== categoryId)) {
    finalSlug = `${baseSlug}-${n++}`;
  }
  
  const updated = now();

  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute(
      "UPDATE categories SET name=?, slug=?, updated_at=? WHERE id=?",
      [name, finalSlug, updated, categoryId]
    );
  } else {
    const db = await getLocalDb();
    const index = db.categories.findIndex(c => c.id === categoryId);
    db.categories[index] = { ...db.categories[index], name, slug: finalSlug, updated_at: updated };
    await saveLocalDb(db);
  }

  return { ...existing, name, slug: finalSlug, updated_at: updated };
}

export async function deleteCategory(categoryId) {
  if (isGcp()) {
    const pool = await getCmsPool();
    await pool.execute("DELETE FROM categories WHERE id=?", [categoryId]);
  } else {
    const db = await getLocalDb();
    const index = db.categories.findIndex(c => c.id === categoryId);
    if (index >= 0) {
      db.categories.splice(index, 1);
      await saveLocalDb(db);
    }
  }
}
