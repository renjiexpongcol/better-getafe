export function validateDestination(body) {
  const result = {};
  for (const [key, max] of Object.entries({ title: 200, slug: 200, shortDescription: 1200, fullDescription: 30000, featuredImage: 500, imageAlt: 500, location: 300, category: 100 })) {
    if (typeof body[key] !== 'string' || body[key].length > max) throw new Error(`Please provide a valid ${key} (up to ${max} characters).`);
    result[key] = body[key].trim();
  }
  if (!result.title || !result.shortDescription || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(result.slug)) throw new Error('Title, description and a lowercase hyphenated slug are required.');
  if (typeof body.published !== 'boolean' || typeof body.featured !== 'boolean' || !Number.isInteger(body.displayOrder) || body.displayOrder < 0 || body.displayOrder > 100000) throw new Error('Please check publication, featured and display order values.');
  Object.assign(result, { published: body.published, featured: body.featured, displayOrder: body.displayOrder });
  if (result.published && (!result.featuredImage || !result.imageAlt)) throw new Error('Select a verified featured image and write meaningful alt text before publishing.');
  return result;
}
