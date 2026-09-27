import test from 'node:test';
import assert from 'node:assert/strict';
import { validateDestination } from '../server/src/services/destinationValidation.js';
import { pagePathForFile } from '../src/routeConfig.js';
const draft = { title: 'An island', slug: 'an-island', shortDescription: 'Coastal community', fullDescription: '', featuredImage: '', imageAlt: '', location: '', category: '', published: false, featured: true, displayOrder: 1 };
test('drafts may be saved without an image but publishing requires image and alt text', () => {
  assert.equal(validateDestination(draft).published, false);
  assert.throws(() => validateDestination({ ...draft, published: true }), /image/);
  assert.throws(() => validateDestination({ ...draft, published: true, featuredImage: 'media/photo.webp' }), /alt/);
  assert.equal(validateDestination({ ...draft, published: true, featuredImage: 'media/photo.webp', imageAlt: 'Mangroves along the shore' }).published, true);
});
test('reject malformed content, flags and ordering', () => {
  for (const patch of [{ slug: '../private' }, { title: '' }, { published: 'false' }, { featured: 1 }, { displayOrder: -1 }, { displayOrder: 1.5 }, { shortDescription: 'x'.repeat(1201) }]) assert.throws(() => validateDestination({ ...draft, ...patch }));
});
test('discover routes follow the public route manifest', () => {
  assert.equal(pagePathForFile('./pages/discover/Discover.jsx'), '/discover');
  assert.equal(pagePathForFile('./pages/discover/Destination.jsx'), '/discover/:slug');
});

import { destinationRequest } from '../src/services/destinations.js';
test('destination requests preserve HTTP status for non-JSON errors and reject malformed success responses', async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => new Response('<html>Unavailable</html>', { status: 503 });
    await assert.rejects(destinationRequest('/api/discover'), error => error.status === 503 && !error.message.includes('<html>'));
    globalThis.fetch = async () => new Response('<html>Unexpected proxy response</html>', { status: 200 });
    await assert.rejects(destinationRequest('/api/discover'), /unavailable/);
    globalThis.fetch = async () => new Response(null, { status: 204 });
    assert.equal(await destinationRequest('/api/admin/destinations/example', { method: 'DELETE' }), null);
  } finally { globalThis.fetch = originalFetch; }
});
