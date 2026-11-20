# SandBox applications

Public website where students learn about SandBox and apply, plus a password-protected admin dashboard for reviewing applicants.

- `/` is the public site with the application form.
- `/admin` is the admin dashboard: sign in, see every applicant, search, filter by role and status, open an application, set its status (pending, shortlisted, accepted, rejected), add internal notes, delete, and export to CSV.

## Run it locally

Requires Node.js 22.13 or newer. There is one dependency (Express); the database is SQLite through Node's built-in driver, so there is nothing to install or compile.

```bash
npm install
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-long-password' npm start
```

Open http://localhost:3000 for the site and http://localhost:3000/admin for the dashboard.

The admin account is created the first time the server starts. If you don't set `ADMIN_PASSWORD`, a random password is generated and printed in the server log once. You can change it from the dashboard with **Change password**.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | Port to listen on |
| `NODE_ENV` | | Set to `production` when hosted over HTTPS (enables secure cookies) |
| `ADMIN_EMAIL` | `admin@sandbox.local` | First admin's email (only used when no admin exists yet) |
| `ADMIN_PASSWORD` | random | First admin's password |
| `DB_PATH` | `./data/sandbox.db` | SQLite database file |

## Deploying

The app is a single Node server with a SQLite file, so the host needs a **persistent disk** for `DB_PATH`, otherwise applications are lost on redeploy.

- **Railway / Render / Fly.io:** create a Node service from this repo, attach a volume, set `DB_PATH` to a path on that volume, and set the variables above. Start command: `npm start`.
- **Docker / any VPS:** `docker build -t sandbox . && docker run -p 3000:3000 -v sandbox-data:/data -e ADMIN_EMAIL=... -e ADMIN_PASSWORD=... sandbox`

Back up the database file regularly; it holds every application.

## Security notes

- Passwords are hashed with scrypt. Sessions are random tokens stored hashed in the database, sent as `HttpOnly`, `SameSite=Strict` cookies that expire after 7 days.
- Sign-in is rate limited (10 attempts per 15 minutes per IP), and so are submissions (10 per hour per IP). The form also has a hidden honeypot field to catch simple bots.
- All input is validated on the server, not only in the browser. CSV export guards against spreadsheet formula injection.
