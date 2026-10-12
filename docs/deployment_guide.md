# Deployment configuration

This repository can build a React frontend and an Express/Socket.IO backend. Deployment was not performed as part of the local audit. Use a separate staging environment before handling real incidents.

## Database and migrations

Choose durable SQLite storage for a single backend instance or a PostgreSQL service. Keep DATABASE_URL in the backend host's secret settings; never paste database passwords into frontend configuration or commit them.

The prepare-schema script selects the Prisma datasource provider from DATABASE_URL. Generate the client for the chosen provider during build. The repository does not yet contain a reviewed production migration history: create and review provider-specific migrations in staging, rehearse backup/restore, and apply them before starting the application. Do not reset or seed a production database. SQLite-to-PostgreSQL migration also requires an explicit data export/import plan; changing the connection URL alone does not copy records.

Local development uses npm run db:setup. This backs up the selected SQLite DB and refuses production use or data-loss flags. It is not the production migration tool.

## Backend host

Set the service root to backend, install locked dependencies with npm ci, run npm run build, and start with npm start. Provide the host's port and bind HOST=0.0.0.0 only when it must accept service traffic.

Required production configuration:

- NODE_ENV=production and an explicit DATABASE_URL pointing to durable storage.
- JWT_SECRET containing at least 32 bytes of random secret material, generated privately. Previously published/default keys are rejected. Key rotation invalidates existing tokens.
- CORS_ORIGIN containing the exact HTTPS frontend origins, comma-separated. Wildcard origins are not supported.
- TRUST_PROXY only if required, with the actual trusted proxy IP/CIDR ranges. Do not blindly trust caller-supplied forwarding headers.
- DISABLE_RATE_LIMITS=false; production cannot use the loopback test bypass.
- ENABLE_DEMO=false and RESET_DEMO_DATA=false. Remove or securely reprovision all privileged public-demo accounts; startup rejects their known demo password.
- OFFLINE_HUB_SECRET only when provisioned relays are used, with at least 32 bytes of private random material. Keep it on trusted relay devices.
- MFA_ENCRYPTION_KEY containing a stable random 32-byte key encoded as base64; keep a separate protected backup. Production operators must enroll their own authenticator. Keep REQUIRE_OPERATOR_MFA=true.

Create an administrator through npm run admin:create with private ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD environment variables. The password must be at least 12 characters and at most 72 UTF-8 bytes. Remove provisioning variables afterward. The command will not replace or elevate an existing account.

For real notifications, configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER, and persistent VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and VAPID_SUBJECT. Enable external delivery only in an explicitly selected environment. Provider-free simulations report zero real deliveries. Configure OPENWEATHER_API_KEY for live weather; mock_mode_active uses simulation data.

Set TWILIO_WEBHOOK_BASE_URL to the exact public HTTPS origin and configure the signed inbound/status callbacks. Verify consented recipient phones before real broadcasts. Set RESEND_API_KEY and EMAIL_FROM for email verification and password recovery. Provider acceptance is distinct from a device receipt; inspect uncertain deliveries before sending again. See GAP_UPGRADE.md for delivery states and retention behavior.

## Frontend host

Set the root to frontend, install with npm ci, build with npm run build and serve dist. Configure VITE_API_URL to the backend HTTPS origin before building. Leave VITE_ENABLE_DEMO=false; all VITE_ values are public. When developing with a named tunnel, explicitly list its hostname in VITE_ALLOWED_HOSTS.

Vercel security headers are configured in frontend/vercel.json. Other hosts must apply equivalent content-security, framing, MIME and referrer headers. Review the CSP against the actual map tile, font, API and WebSocket providers. Preserve the emitted sw.js and offline-assets.json; deploy all assets from one build together.

Use HTTPS and WSS. Camera, location, push and service-worker features require a browser secure context; do not disable browser protections to make a LAN demo work. Use an authenticated WPA2/WPA3 network and proper TLS for private incident/contact data.

## Staging verification

Verify registration/login, volunteer approval/revocation, SOS ownership and dispatch, private WebSocket recipients, audit/stock concurrency, pickup eligibility, missing-person updates, account switching and offline replay. Test real push/SMS with consented test recipients, including provider failures. Verify service-worker update and offline reload on supported devices and camera/GPS denial handling.

Rehearse database restoration and migrations, test rate limits behind the real proxy, and load-test shared-IP and multiple-instance behavior. Request quotas now use shared database buckets. For larger deployments, test the chosen database and proxy, size pagination limits, and set reviewed privacy retention policies. SQLite on local disk is a single-node deployment; use a properly migrated shared PostgreSQL database for multiple hosts.

See GAP_UPGRADE.md for the latest verification and external dependencies, PILOT_PLAN.md for field evidence, and PROJECT_AUDIT.md for the earlier audit.
