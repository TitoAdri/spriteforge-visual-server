# Email verification and Google sign-in

SpriteForge does not grant free credits until a user controls a verified email address. Password registrations remain unverified until the one-time, 24-hour verification link is used. Google registrations are verified only when Google reports `email_verified: true`.

## Email delivery (Resend)

Create an API key at [Resend](https://resend.com/api-keys), verify a sending domain, then add these server-only values to `generator/.env`:

```dotenv
RESEND_API_KEY=re_...
SPRITEFORGE_EMAIL_FROM=SpriteForge <accounts@spriteforge.xyz>
SPRITEFORGE_APP_ORIGIN=https://spriteforge.xyz
```

The `From` address must belong to a domain verified in Resend. Do not put these values in browser code or in the frontend container.

## Google OAuth

In Google Cloud Console, create an OAuth 2.0 **Web application** client. Add exactly these URLs:

- Authorized JavaScript origin: `https://spriteforge.xyz`
- Authorized redirect URI: `https://spriteforge.xyz/api/auth/google/callback`

Then add these server-only values to `generator/.env`:

```dotenv
GOOGLE_OAUTH_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=GOCSPX-...
GOOGLE_OAUTH_REDIRECT_URI=https://spriteforge.xyz/api/auth/google/callback
```

After changing the file, rebuild the two Docker services. The Google button only appears after both client credentials are valid. Rotate a secret immediately if it is ever pasted into a chat, commit, screenshot or browser console.

## Built-in abuse controls

- A verified email is required before credits or generation features are unlocked.
- Maximum three new password registrations per network prefix every 24 hours, persisted in the private database; a privacy-preserving HMAC is stored instead of a raw IP address.
- Honeypot field, registration and resend rate limits, account lockout after failed password attempts, secure Host-only session cookies, CSRF and same-origin checks.
- Google OAuth uses PKCE, one-time state records and a verified Google email claim.

For a public launch, place Cloudflare Turnstile or equivalent bot protection in front of registration as an additional defence against disposable mail and proxy networks.
