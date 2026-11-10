# AeroTrack Pro

Browser-based baggage tracking interface built with HTML, CSS, and JavaScript ES modules, plus a MongoDB-backed API for account authentication.

## Run locally

Requirements: Node.js 20.19 or newer and npm 10 or newer.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vite. To create and preview a production build:

```bash
npm run build
npm run preview
```

## MongoDB authentication API

The API connects to MongoDB on the server; never put the MongoDB URI in frontend code or commit it. The URI/password previously shared in chat should be rotated in MongoDB Atlas before use. Create a database user with only the permissions the app needs, and allow the server's IP address in Atlas Network Access.

1. Copy `.env.example` to `.env` and set `MONGODB_URI` to the URI containing the rotated database password. Set a random `SESSION_SECRET` of at least 32 characters. `.env` is ignored by git. For an existing local setup, the API also reads `server/.env`; values in the root `.env` take precedence.
2. Keep `EMAIL_PROVIDER=dev` for local work. Verification/reset codes will appear on the verification page or in the development outbox at `/dev-outbox`; they are not emailed.
3. Run `npm run dev`. This starts Vite and the API; Vite forwards `/api` requests to the local API.
4. For deployed use, set `NODE_ENV=production`, `HOST=0.0.0.0`, `EMAIL_PROVIDER=smtp`, and configure the `MAIL_*` values. Production refuses to start with development email enabled. Serve the frontend and API on the same origin, or route `/api` through a same-origin reverse proxy so the HTTP-only session cookie is sent securely.

Registration creates passenger accounts only. Staff/admin roles must be assigned by a trusted administrator. This backend implements account registration, email verification, login/logout, password reset/change, profile preferences, and sessions. Other app data (baggage, flights, incidents, analytics, etc.) still requires its own compatible API; those features are not made MongoDB-backed by this authentication connection.

To use the presentation-only local demo instead, set `AEROTRACK_DEMO_MODE` to `true` in [client/js/config.js](client/js/config.js). Demo mode bypasses real authentication and should not be used as a production login.

## Checks

```bash
npm test
npm run lint
```

## Project review demo

Run `npm ci`, configure `.env`, then run `npm run dev` and open the local URL. Create an account and complete email verification using the development code/outbox, then sign in. The rest of the operational pages require their corresponding data API.

## Project layout

- `client/` — app pages, components, styles, icons, QR libraries, domain helpers, and tests.
- `server/` — MongoDB-backed authentication API.
- `client/vendor/` — locally bundled QR generation and scanning libraries.

Camera-based QR scanning requires HTTPS or `localhost`. QR payloads encode a baggage reference only; resolving baggage data requires the compatible API.

## Three-person contribution split

Each teammate should own the listed files and their related tests. Avoid editing another person's files on the same branch; coordinate shared changes before starting them.

| Teammate | Module ownership | Main contribution |
| --- | --- | --- |
| Sanjiv Kumar A | `client/js/main.js`, `client/js/lib/router.js`, `client/js/lib/auth.js`, `client/js/components/layouts.js`, `client/js/pages/landing.js`, `client/js/pages/about.js`, `client/js/pages/auth.js`, `client/test/router.test.js` | Page navigation, layouts, demo sign-in, and public landing/about pages |
| Dheena Dhayal M | `client/js/pages/passenger.js`, `client/js/components/baggage.js`, `client/js/components/lookup.js`, `client/shared/qr.js`, `client/shared/index.js`, `client/test/lookup.test.js` | Passenger baggage pages, QR generation/scanning, and lookup |
| Rebakha Snowit M | `client/js/pages/staff.js`, `client/js/pages/board.js`, `client/js/pages/admin.js`, `client/js/pages/general.js`, `client/js/lib/api.js`, `client/shared/airlines.js`, `client/shared/anomaly.js`, `client/shared/domain.js`, `client/shared/prediction.js`, `client/shared/simulation.js`, `client/shared/status.js`, `client/test/board.test.js`, `client/test/shared.test.js` | Staff/admin/operations pages and frontend demo/API behavior |

Keep changes within each assignment when possible. Before merging, all teammates should run `npm test` and `npm run lint`; one integrator should also run `npm run build`.

## GitHub team workflow

Create the GitHub repository once, add all three teammates as collaborators, and push the starter project from the project folder:

```bash
git init
git add .
git commit -m "Create frontend project"
git branch -M main
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Each teammate clones the repository once and installs dependencies:

```bash
git clone https://github.com/OWNER/REPOSITORY.git
cd REPOSITORY
npm ci
npm run dev
```

For each contribution, work on a separate branch, run the checks, and push that branch:

```bash
git switch main
git pull
git switch -c feature/your-module
# Edit only your assigned module and related tests
npm test
npm run lint
git add .
git commit -m "Describe your frontend change"
git push -u origin feature/your-module
```

Open a pull request from that branch into `main`. After it is merged, teammates update their local `main` with `git switch main` and `git pull` before starting the next task. Replace `OWNER/REPOSITORY` with the actual GitHub repository name.
