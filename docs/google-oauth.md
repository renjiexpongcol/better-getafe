# Google OAuth configuration

Create a Web application OAuth client in Google Cloud Console.

Authorized JavaScript origins:

```text
http://localhost:5173
https://getafe.gov.ph
https://getafe.supra-intra.org
```

Authorized redirect URIs:

```text
http://localhost:5173/auth/callback
https://getafe.gov.ph/auth/callback
https://getafe.supra-intra.org/auth/callback
```

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in the deployment environment or Admin Settings. Do not wrap the redirect URI in quotes: use `https://getafe.gov.ph/auth/callback`, not `"https://getafe.gov.ph/auth/callback"`. The redirect URI must exactly match the origin and path registered in Google Cloud Console. Google returns to the browser callback at `/auth/callback`, which forwards the authorization response to the backend API handler. For production, use the production HTTPS URI; keep the localhost URI only for local development.
