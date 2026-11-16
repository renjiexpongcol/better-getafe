export function sendStartupPage(req, res, { starting }) {
  if (!['GET', 'HEAD'].includes(req.method) || /^\/(?:api|assets)(?:\/|$)/i.test(req.path)) return false;
  const mode = req.get('Sec-Fetch-Mode');
  const wantsDocument = mode
    ? mode === 'navigate'
    : /(?:^|,)\s*text\/html(?:\s*;[^,]*)?(?:,|$)/i.test(req.get('Accept') || '') && req.accepts('html');
  if (!wantsDocument) return false;

  const title = starting ? 'The portal is starting up' : 'The portal is temporarily unavailable';
  const description = starting
    ? 'We’re getting Better Getafe ready. Wait a moment, then try opening this page again.'
    : 'Better Getafe can’t load this page right now. Please try again in a moment.';

  res.set({
    'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  }).type('html').send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} | Better Getafe</title>
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; background: #f2f6fa; color: #122d50; font: 1rem/1.55 system-ui, sans-serif; }
    main { min-height: 100vh; min-height: 100svh; display: grid; place-items: center; padding: 1rem; }
    section { width: min(100%, 34rem); background: white; border: 1px solid #cfdae7; border-radius: 1rem; padding: clamp(1.25rem, 5vw, 3rem); text-align: center; box-shadow: 0 12px 36px #122d5014; }
    svg { display: block; margin: 0 auto 1rem; padding: .75rem; width: 3.5rem; height: 3.5rem; background: #e7f0fa; border-radius: .75rem; }
    .brand { font-size: .875rem; font-weight: 700; margin: 0 0 .5rem; }
    h1 { font-size: clamp(1.5rem, 5vw, 2rem); line-height: 1.2; margin: 0; }
    p { color: #405874; margin: 1rem 0 1.5rem; }
    a { display: inline-block; padding: .65rem 1.35rem; border-radius: .5rem; background: #14395f; color: white; font-weight: 650; text-decoration: none; }
    a:hover { background: #0e2a49; }
    a:focus-visible { outline: 3px solid #176fbc; outline-offset: 4px; }
  </style>
</head>
<body>
  <main><section aria-labelledby="title">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>
    </svg>
    <p class="brand">Better Getafe · Municipality of Getafe</p>
    <h1 id="title">${title}</h1>
    <p>${description}</p>
    <a href="">Try again</a>
  </section></main>
</body>
</html>`);
  return true;
}
