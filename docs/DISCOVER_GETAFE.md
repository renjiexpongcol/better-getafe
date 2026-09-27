# Discover Getafe

The homepage section follows the existing municipal content and precedes the global footer. It uses the shared `.container`, portal fonts and link colors. `/discover` lists published destinations; `/discover/:slug` shows published detail content.

CMS: Admin > Discover Getafe. Existing `content.news.manage` permission controls destination management; Media Library uploads retain `content.media.manage`. Uploads use the existing admin upload handler and storage endpoints. Select the uploaded image from the featured-image list after uploading. Publishing requires an existing Media Library image and meaningful alt text. Full descriptions are plain text and preserve paragraph breaks.

Migration: `database/migrations/postgresql/009_discover_getafe.sql` creates the table and three editable drafts without fabricated image references. It has been applied to the configured development database. Verify photos and destination wording before publishing. The reef draft deliberately omits the unverified worldwide reef-count claim. Existing media with a Banacon filename was found, but its identity has not been visually verified or assigned automatically.

Media deletion recognizes destination references; a forced deletion clears the image and unpublishes affected destinations. No new storage infrastructure or image transformation service is introduced. Images use existing storage URLs, lazy loading and a reserved 16:9 ratio. Actual smaller image derivatives depend on the existing media service; no fictitious srcset variants are generated.

Checks:
- `npm run build`
- `npm run lint`
- `node --test scripts/test-discover.mjs scripts/test-routing.mjs`
- Set `RUN_DISCOVER_DB_TESTS=1` and run `node --test scripts/test-discover-integration.mjs` for PostgreSQL and API checks. Fixtures are rolled back.

Restart the existing backend process after deployment so it registers the new API routes. Other environments must apply the migration before starting the updated server.

Browser layout QA: actual card component checked in an isolated development preview at 1280px, 820px and 390px. Verified 3/2/1 columns, equal desktop card heights and CTA positions, no horizontal overflow, 16px mobile gutters and 16:9 images. Test imagery was confined to the preview and never published. Full authenticated CMS interaction and a complete automated accessibility audit were not performed.


## Legacy tourism migration

Migration `010_legacy_tourism_destinations.sql` imports Pandanon, Corte Paradise, Handumon and Verador as drafts and fills only the empty, unpublished original Banacon seed description. Existing edited destination records are preserved. CMS news text takes precedence over the archived legacy page text; news records remain intact. HTML is converted to plain text for the destination editor. Review factual claims, legacy contacts and formatting before publishing. No unrelated photo is assigned.

Both `/tourism` and `/discover` now list the same published destination records. The old `/tourism/banacon`, `/tourism/pandanon`, `/tourism/corte-paradise`, `/tourism/handumon` and `/tourism/verador` pages load through `/api/discover/legacy/:key`. Aliases reference record IDs, so slug changes do not break old links. Unpublishing or deleting a destination makes its old URL show the same resource-not-found state as the canonical page. Static fallback content and legacy detail-page image URLs were removed from React.

The migration was applied locally: five aliases resolve to five CMS drafts with their full descriptions; four new records plus the existing Banacon record. None has a verified featured image assigned. An editor must select a verified Media Library image, enter alt text, review the imported copy, and publish. The imported profiles are not shown publicly until then.

The PostgreSQL integration test also verifies repeat-safe migration, preservation of editorial changes, aliases surviving slug edits, and public 404 responses for unpublished legacy destinations.
