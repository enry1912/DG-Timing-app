# Cloudflare setup

Do not enter secrets into source files or chat.

1. Install or run Wrangler, then sign in: `npx wrangler login --use-keyring`.
2. Create the database: `npx wrangler d1 create dg-timing`.
3. Copy the returned database ID into `wrangler.toml`.
4. Apply the schema: `npx wrangler d1 execute dg-timing --remote --file migrations/0001_auth_and_profiles.sql`.
5. This app deploys to the existing `dg-timing-app` Worker. Its Worker URL is configured as `APP_ORIGIN`.
6. In Google Cloud, create a Web OAuth client. Its authorized redirect URI is `https://YOUR_DOMAIN/api/auth/google-callback`.
7. Configure a verified Resend sender address/domain.
8. After the first Worker deployment, add production secrets interactively:
   - `npx wrangler secret put GOOGLE_CLIENT_ID`
   - `npx wrangler secret put GOOGLE_CLIENT_SECRET`
   - `npx wrangler secret put RESEND_API_KEY`
9. Deploy the Worker and static assets with `npx wrangler deploy` from this project folder.

Before inviting users, verify registration, email verification, password reset, Google sign-in, profile ownership, profile deletion, and account deletion on the deployed HTTPS domain.
