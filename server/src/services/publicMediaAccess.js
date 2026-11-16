// Local public storage only serves completed media-library records. Private
// prefixes and pending uploads never become public merely by existing on disk.
export function publicMediaAccess({ getMediaByStoragePath, validateObjectKey }) {
  return async (req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) return res.sendStatus(405);
    let key;
    try { key = decodeURIComponent(req.path).replace(/^\/+/, ''); }
    catch { return res.sendStatus(400); }
    if (!validateObjectKey(key) || /^(citizen-private|profiles|eservices)\//i.test(key)) return res.sendStatus(404);
    try {
      const media = await getMediaByStoragePath(key);
      if (!media || media.status !== 'active' || !['image/jpeg', 'image/png', 'image/webp'].includes(media.content_type)) return res.sendStatus(404);
      res.set('X-Content-Type-Options', 'nosniff');
      next();
    } catch { return res.status(503).json({ error: 'Media is temporarily unavailable.' }); }
  };
}
