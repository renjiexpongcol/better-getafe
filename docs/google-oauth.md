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
http://localhost:5173/api/auth/google/callback
https://getafe.gov.ph/api/auth/google/callback
https://getafe.supra-intra.org/api/auth/google/callback
```

Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` in the deployment environment or Admin Settings. The redirect URI must exactly match the origin and path registered in Google Cloud Console. For production, use the production HTTPS URI; keep the localhost URI only for local development.
