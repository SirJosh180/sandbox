# SandBox applications

Public website where students learn about SandBox and apply, plus a password-protected admin dashboard for reviewing applicants.

- `/` is the public site with the application form.
- `/admin` is the admin dashboard: sign in, see every applicant, search, filter by role and status, open an application, set its status (pending, shortlisted, accepted, rejected), add internal notes, delete, and export to CSV.

## Deploy on Vercel

1. Import this repo in Vercel (or keep the project you already have). No build settings are needed: `vercel.json` serves `public/` as static files and runs the API from `api/index.js`.
2. In the Vercel project, open **Storage → Create Database → Neon (Postgres)**, pick the free plan and connect it to this project. Vercel adds `DATABASE_URL` for you.
3. Open **Settings → Environment Variables** and add `ADMIN_EMAIL` and `ADMIN_PASSWORD` (a long password).
4. Redeploy (**Deployments → ⋯ → Redeploy**), or push a commit.
5. Visit `/admin` and sign in. Tables are created automatically on the first request.

## Run it locally

Requires Node.js 22 or newer.

```bash
npm install
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm start
```

On Windows PowerShell:

```powershell
$env:ADMIN_EMAIL="you@example.com"; $env:ADMIN_PASSWORD="a-long-password"; npm start
```

Open http://localhost:3000 for the site and http://localhost:3000/admin for the dashboard.

Without `DATABASE_URL`, the app uses PGlite, an embedded Postgres saved in `./data`, so there is nothing else to install. To use your Neon database locally instead, set `DATABASE_URL` to its connection string.

The admin account is created the first time the app gets a request. Locally, if you don't set `ADMIN_PASSWORD`, a random one is printed in the terminal once. You can change it from the dashboard with **Change password**.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` (or `POSTGRES_URL`) | | Postgres connection string. Required on Vercel. |
| `ADMIN_EMAIL` | `admin@sandbox.local` | First admin's email (only used when no admin exists yet) |
| `ADMIN_PASSWORD` | random locally | First admin's password. Required on Vercel. |
| `DB_PATH` | `./data/pglite` | Folder for the embedded local database |
| `PORT` | `3000` | Local port |

## Project layout

- `public/`: the site (`index.html`) and the dashboard (`admin/index.html`)
- `lib/app.js`: the Express API
- `lib/db.js`: Postgres or embedded PGlite
- `api/index.js`: Vercel function entry
- `local.js`: local server entry

## Security notes

- Passwords are hashed with scrypt. Sessions are random tokens stored hashed in the database, sent as `HttpOnly`, `SameSite=Strict` cookies that expire after 7 days.
- Sign-in is rate limited (10 attempts per 15 minutes per IP), and so are submissions (10 per hour per IP). Limits are stored in the database so they hold across serverless instances. The form also has a hidden honeypot field to catch simple bots.
- All input is validated on the server, not only in the browser. CSV export guards against spreadsheet formula injection.

## Cubit, the helper buddy

Cubit lives in `public/cubit/`. `cubit.js` draws Cubit as an inline SVG in four moods (`hello`, `build`, `hmm`, `oops`) and runs the floating helper on the public site, which greets visitors, cheers on form progress, gives tips, and reacts to form errors. Standalone animated icons for each mood are in `public/cubit/cubit-<mood>.svg` for use elsewhere (they look best on a light background).
