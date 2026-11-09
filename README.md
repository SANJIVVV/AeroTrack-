# AeroTrack Pro frontend

Browser-only baggage tracking interface built with HTML, CSS, and JavaScript ES modules. It includes QR-code generation for baggage tags and QR scanning from a camera or image.

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

## API connection

This repository contains the frontend only; it does not include an API or database. Demo mode is on by default and lets you navigate as a passenger, staff member, or administrator without a backend. Sign-in is stored in this browser only.

On the sign-in page, choose one of the demo roles:

- Passenger: `passenger@demo.aerotrack.local`
- Airport staff: `staff@demo.aerotrack.local`
- Administrator: `admin@demo.aerotrack.local`

Demo accounts have no password. Click a role button to sign in and open its dashboard. Use the sidebar or page links to move between screens; sign out to choose a different role. Demo sessions are only for presentation and do not provide real authentication or server-backed baggage data.

Set `AEROTRACK_API_BASE` in [client/js/config.js](client/js/config.js) to the API origin when it is hosted separately. Leave it empty when the API is served from the same origin. A separately hosted API must allow the frontend origin and credentialed requests.
Set `AEROTRACK_DEMO_MODE` to `false` in the same file to use API-backed authentication instead of local demo accounts.

## Checks

```bash
npm test
npm run lint
```

## Project review demo

Run `npm ci` and `npm run dev`, open the local URL, then choose **Sign in** and select a demo role. The passenger, staff, and administrator accounts open their respective dashboards. Use the sidebar, dashboard links, and buttons to move between pages. Demo pages are read-only; creating records requires a connected API.

## Project layout

- `client/` — app pages, components, styles, icons, QR libraries, domain helpers, and tests.
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

