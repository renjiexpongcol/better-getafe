-- Legacy guide text is preserved for review, never automatically published.
-- Existing destination edits and original news records are preserved.
CREATE TABLE IF NOT EXISTS destination_legacy_routes (
 legacy_key TEXT PRIMARY KEY,
 destination_id TEXT NOT NULL REFERENCES destinations(id) ON DELETE CASCADE
);
CREATE TEMP TABLE legacy_destination_import (
 legacy_key TEXT, slug TEXT, news_slug TEXT, title TEXT, excerpt TEXT,
 content TEXT, category TEXT, location TEXT, display_order INTEGER
) ON COMMIT DROP;
INSERT INTO legacy_destination_import VALUES
('banacon', 'banacon-island-mangrove-forest', 'man-made-mangrove-forest', 'Banacon Island Mangrove Forest', 'Banacon Island is home to one of Asia''s largest man-made mangrove forests.', 'Banacon is one of Getafe''s nine (9) island barangays, approximately 5.0 kilometers from the town proper and reachable by a 30-minute pumpboat ride from the town''s wharf. It derived its name from a fish locally called “Banak” or mullet (Mugil cephalus), a species once abundant in the area.

It has a total area of 1,775.04 hectares, of which 11.01 hectares are dry land or populated area, while the rest comprise the island''s mudflats. Of these, 484.82 hectares form a man-made mangrove forest known as one of the largest in Asia.

Because of the extensive mangrove cover, residents now have more fish, seashells, and other marine products to gather or catch. Banacon is also known for its blue crabs, with an average daily catch of 300 kilograms.

How was it possible?

Banacon was previously devoid of trees. In the late 1950s, Eugenio Paden, known locally as Mang Denciong, collected propagules from neighboring islands and planted them in Banacon''s vacant areas. When the seedlots began growing on their own, he continued planting and caring for them.

His initiative earned him the LIKAS YAMAN award in 1980, as well as recognition from the Food and Agriculture Organization. Communal and social forestry programs later expanded the work, and the first man-made mangrove forest was formally established in 1990.

Today, the plantation has a multi-layered canopy with trees ranging from 2 to 45 years old, and around 18 mangrove and associated species can be found in Banacon.', 'Nature', 'Banacon Island, Getafe, Bohol', 2),
('pandanon', 'pandanon-island', 'pandanon-island', 'Pandanon Island Resort', 'A sandy island escape between Bohol and Cebu, with clear blue water, sunset views, and a growing wakeboarding community.', 'Pandanon is one of the 9 island barangays of Getafe. It is located approximately midway from Bohol to Cebu. Part of the island is a strip of sandy paradise. This place was once a secret getaway for residents and local visitors alike, before gaining popularity and being introduced to tourists.

Aside from its long powdery sand bar, one could not resist taking a refreshing dip in its cool, clear blue waters. It is a very good place to relax, have drinks with friends and family, and take in the mesmerizing sunset view. Beach volleyball, skimboarding, and frisbee are only a few of the activities you can enjoy during your stay.

Bohol''s first wakeboarding destination

In 2012, Bohol Wakefest was held at Pandanon, signifying the resort''s becoming the first wakeboarding destination in Bohol. Wakeboarders and wakeskaters, foreigners and Filipinos alike, participated in the event. Tourists and local visitors were entertained as wakeboarders showed astonishing tricks to amaze the crowd.', 'Islands', 'Pandanon Island, Getafe, Bohol', 4),
('corte-paradise', 'corte-paradise-resort', 'corte-paradise-resort', 'Corte Paradise Resort', 'A riverside and beachside resort in Barangay Corte-Baud with pools, cottages, accommodations, and views across Getafe’s coast.', 'Whether you are an overworked employee longing for a much-needed vacation, an event planner looking for a birthday or wedding venue, a budget-conscious homemaker planning a weekend with the kids, a local resident ready to sing along to the latest hits, or a traveler looking for an affordable place to relax, there is always something in store for you at Corte Paradise Resort.

Corte Paradise Resort is a riverside and beachside resort conveniently situated along the shores of Barangay Corte-Baud. During daytime, visitors can unwind while enjoying the scenic view of its mangrove-lined riverbanks. At night, guests can enjoy the romantic ambience of the beachside view toward Cebu’s city lights while savoring the freshness of the gentle sea breeze.

In addition to picnic cottages, guest accommodations, and other amenities, the resort also boasts a spring-water swimming pool. It is the only pool within the area that receives direct freshwater replenishment from a subterranean spring-water basin located 150 meters above sea level within the slopes of Mt. Corte. The resort continues to add amenities and services for its valued customers.

A complete Getafe experience

No visit to Getafe would ever be complete without relishing the Corte Paradise Resort experience.

Legacy contact information (verify before publishing)
Smart: +63 920 487 6264
Sun: +63 923 662 6391
Facebook: https://www.facebook.com/pages/Corte-Paradise/186863917062', 'Community', 'Corte-Baud, Getafe, Bohol', 5),
('handumon', 'handumon-marine-sanctuary', 'handumon-marine-sanctuary', 'Handumon Marine Sanctuary', 'A community-protected marine sanctuary and seahorse village on the northwestern side of Jandayan Island in Getafe.', 'This sanctuary, also called Libaong Marine Sanctuary, is on the northwestern part of Jandayan Island in Getafe. Residents in Handumon are mostly seaweed farmers and fishers. Spear fishing with a lantern, or “subiran,” at the prow of paddle boats is commonly practiced.

Marine Protected Area

A recovered reef protected for more than 10 years forms the 50-hectare community-based Marine Protected Area, proudly managed by the village MPA Management Council. It is a no-take zone, but snorkeling and diving are allowed in certain areas within the marine sanctuary. It won as the best MPA in the Philippines in 2007.

Guesthouse and training center

Overlooking the marine protected area and the canopy of mangroves, the guesthouse is a peaceful place to enjoy a night. The training center caters to meetings and trainings, with food services available by arrangement.

Arrange a night-fishing visit with a lantern fisher and experience how these small-scale fishers make a living for the day.

Mangroves

There are 35 true mangrove species documented in the Philippines, and 27 of these are found in the Danajon Bank region. Mangrove swamps play an important role in our coastal ecosystem. Enrichment planting of this important resource is an ongoing practice in the village. When you visit Handumon, you can plant young mangroves or propagules.

Benefits of protection

Greater fish biomass than in unprotected sites after seven years.

Increased size and sustained abundance of seahorses.

Other barangays were inspired to establish MPAs in 2002, leading to an island-wide coastal resource management plan.

Seahorse watching

Handumon is known as the seahorse village in Bohol. Seahorses used to be an important fishery in this community, but they are now protected and cannot be harvested. Visitors can book a night of seahorse watching to learn about these gentle sea creatures.

Crafts and community management

Hand-crafted souvenirs made from renewable raw materials support villagers’ supplemental income. Community protection includes sanctuary rules, environmental education, deputized fish wardens, regular biophysical surveys, community cross-visits, and a three-year management plan coordinated with adjacent barangays.', 'Marine & Coastal', 'Handumon, Jandayan Island, Getafe, Bohol', 6),
('verador', 'verador-hill', 'verador-hill', 'Verador Hill', 'Discover Verador Hill and its views across Getafe and the surrounding islands.', 'This hilltop is the highest peak of Getafe. It stands proudly at the crest of gigantic Mt. Corte. From its summit, visitors can see the landscape as far as the town of Ubay on the eastern part of Bohol, the sea waters toward southern Leyte and eastern Cebu, and the waters near Loon, Bohol.


        The dazzling lights of Cebu City can also be seen from afar, appearing like a floating exposition. Its cool mountain breeze, from evening until the early hours of the morning, is a soothing balm to body and soul. A communion with the majestic splendor of Verador Hill is a quiet connection with nature.


        Sunsets, islands, and sea lights


        At sunset, visitors can watch the western horizon change its hues while countless islands appear like a navy fleet guarding the peace-loving people of Bohol. Sandbars stretch across the water like dinosaurs lying drowsily after a bountiful meal.


        In the evening, hundreds of fishing lights can be seen from the hilltop, twinkling like stars across the sea.', 'Nature', 'Getafe, Bohol', 7);
-- Prefer the latest CMS text when a guide already has a news record.
UPDATE legacy_destination_import AS target SET
 title = COALESCE(NULLIF(n.title, ''), target.title),
 excerpt = COALESCE(NULLIF(n.excerpt, ''), target.excerpt),
 content = COALESCE(NULLIF(trim(replace(replace(replace(replace(
   regexp_replace(regexp_replace(n.content, '</(p|h[1-6]|li|div)>', E'\n\n', 'gi'), '<[^>]*>', '', 'g'),
   '&nbsp;', ' '), '&amp;', '&'), '&lt;', '<'), '&gt;', '>')), ''), target.content)
FROM news n WHERE n.slug = target.news_slug;
INSERT INTO destinations (id, slug, title, short_description, full_description, featured_image, image_alt, location, category, published, featured, display_order)
SELECT 'legacy-' || source.legacy_key, source.slug, source.title, source.excerpt, source.content,
 COALESCE(m.storage_path, ''), '', source.location, source.category, FALSE, FALSE, source.display_order
FROM legacy_destination_import source
LEFT JOIN news n ON n.slug = source.news_slug
LEFT JOIN media m ON m.storage_path = n.featured_image AND m.content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif')
ON CONFLICT DO NOTHING;
-- Only enrich the untouched Banacon seed; never overwrite an editor's text or a published page.
UPDATE destinations d SET full_description = source.content, updated_at = CURRENT_TIMESTAMP
FROM legacy_destination_import source
WHERE source.legacy_key = 'banacon' AND d.id = 'discover-banacon'
 AND d.full_description = '' AND d.published = FALSE;
INSERT INTO destination_legacy_routes (legacy_key, destination_id)
SELECT source.legacy_key, d.id FROM legacy_destination_import source
JOIN destinations d ON d.slug = source.slug
ON CONFLICT DO NOTHING;
