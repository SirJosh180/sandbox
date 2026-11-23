# SandBox applications

Public website where students learn about SandBox and apply, plus a password-protected admin dashboard for reviewing applicants.

- `/` is the public site with the application form.
- `/portal` is the student portal: students sign in to follow their application. Once accepted and given a path, the portal becomes a workspace for that path (its own colour, modules to tick off, tools and a path-specific panel).
- `/admin` is the admin portal. **Overview** shows applications per day, the status pipeline, role demand, path progress and items that need attention. **Paths & modules** is a CMS for each path's student-portal content, including a video per module. **Messages** is a chat inbox with every student who has a portal account. **Applicants** is the dashboard: sign in, see every applicant, search, filter by role and status, open an application, set its status (pending, shortlisted, accepted, rejected), add internal notes, delete, and export to CSV.

## Deploy on Vercel

1. Import this repo in Vercel (or keep the project you already have). No build settings are needed: `vercel.json` serves `public/` as static files and runs the API from `api/index.js`.
2. In the Vercel project, open **Storage → Create Database → Neon (Postgres)**, pick the free plan and connect it to this project. Vercel adds `DATABASE_URL` for you.
3. Open **Settings → Environment Variables** and add `ADMIN_EMAIL` and `ADMIN_PASSWORD` (a long password).
4. Redeploy (**Deployments → ⋯ → Redeploy**), or push a commit.
5. Visit `/admin` and sign in. Tables are created automatically on the first request.
6. For module video uploads, open **Storage → Create → Blob**, choose **Public** access and connect it to this project. Vercel adds `BLOB_READ_WRITE_TOKEN`. Redeploy. Without it, admins can still add YouTube or Vimeo links.

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
| `BLOB_READ_WRITE_TOKEN` | | Vercel Blob token for module video uploads. Added by Vercel when you connect a Blob store. |
| `VIDEO_MAX_MB` | `500` | Largest video an admin can upload |
| `UPLOAD_DIR` | `./data/uploads` | Where videos go locally when there's no Blob token |
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

## Student portal and paths

- Students create a password on the application form, or later at `/portal` → **Set up my account** using their email and reference number.
- Admins open an applicant and choose an **Assigned path**. When the application is **accepted** and has a path, the student's portal switches to that path.
- Path content (name, accent colour, mission, modules, side panel and toolkit) is stored in the database and edited in the admin portal under **Paths & modules**. Saving updates every student's portal straight away. `lib/paths.js` holds the defaults used to seed each path and for **Reset to defaults**.

## Module videos

- In **Paths & modules**, each module has a **Video** field. Admins can **Upload video** (MP4, WebM or MOV) or **Paste a link** to YouTube or Vimeo, then **Save changes**. Students see a **Watch video** button on that module in their portal.
- On Vercel, uploads go straight from the admin's browser to Vercel Blob, so large files don't hit the serverless request limit. Locally, they're saved in `./data/uploads`.
- Blob files are public but have unguessable addresses. When a video is removed or replaced and the path is saved, the old file is deleted.
- `public/vendor/vercel-blob-client.js` is the `@vercel/blob` upload client bundled for the browser (`npx esbuild` of `@vercel/blob/client`'s `upload`).

## Messages

- Students open **Messages** in the portal to chat with the SandBox team. Admins answer under **Messages** in the admin portal, or from an applicant's **Message** button.
- The Messages tab shows how many student messages are unread. Both sides check for new messages every few seconds while the chat is open.

## Cubit in the student portal

`public/portal/cubit-buddy.js` puts Cubit in the bottom corner of the portal as the student's helper:

- A red badge counts unread team messages plus the student's next task. Emoji above Cubit's head cycle through what's waiting (💬 messages, 📚 next module, 🎬 video, ⏳ in review, 🎉 all done).
- Clicking Cubit opens a list of notifications with quick actions: **Read**, **Show me** (scrolls to the next module), **Watch**, **Ask the team**.
- Cubit pops up with a burst of emoji when the team sends a new message, when every module is done, and once per browser session as a greeting. Its mood changes with the student's situation.
- The chat has an emoji picker and Cubit's suggested questions for students who haven't written yet. The tab title shows the unread count.

## Output submissions

- Every module in the student portal has **Submit output**: a link to the work (GitHub, Figma, Drive, a live site) and an optional note.
- Admins review them under **Submissions**: give a score from 0 to 100 with optional feedback (**Grade**), or **Return with comment** so the student can fix and resubmit. Grading also ticks the module off for the student.
- Students see the status on each module: ⏳ waiting for review, 🔁 returned with the comment, or 🏅 the grade and feedback. Cubit tells them when something is graded or returned. The Submissions tab shows how many are waiting.

## Projects and the virtual office

- Admins create projects under **Projects**: name, client, description, a meeting room link and a project files link, then add accepted students with a role and an optional team lead.
- Students on a project get a **Virtual office** in their portal with the project details, a **Join meeting room** button and a desk card for each teammate (name, role, path and email). Cubit announces new projects.
