import { citizenServices } from '../../../src/data/citizenServices.js';

export function validateDepartment(input) {
  const text = (key, max = 200) => String(input[key] || '').trim().slice(0, max);
  const slug = text('slug', 120);
  const name = text('name');
  if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Enter an office name and a valid URL slug.');
  const list = key => {
    if (input[key] !== undefined && !Array.isArray(input[key])) throw new Error(`Invalid ${key}.`);
    return [...new Set((input[key] || []).map(String))].slice(0, 100);
  };
  if (input.icon && !['Building2','Landmark','WalletCards','HeartHandshake','Users','Map','ClipboardCheck','FileCheck2'].includes(input.icon)) throw new Error('Choose a supported department icon.');
  const serviceIds = list('serviceIds');
  if (serviceIds.some(id => !citizenServices.some(service => service.id === id))) throw new Error('Choose services from the existing service catalogue.');
  const email = text('email', 254);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address.');
  const displayOrder = Number(input.displayOrder || 0);
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 100000) throw new Error('Enter a valid display order.');
  return {
    name, slug, published: input.published === true, displayOrder, serviceIds,
    shortDescription: text('shortDescription', 1200), description: text('description', 30000),
    responsibilities: text('responsibilities', 10000), programs: text('programs', 15000),
    phone: text('phone', 100), email, location: text('location', 500), hours: text('hours', 500),
    featuredImage: text('featuredImage', 1024), imageAlt: text('imageAlt', 500), icon: text('icon', 80),
    officialSlug: text('officialSlug'), newsIds: list('newsIds'), documentPaths: list('documentPaths'),
  };
}
