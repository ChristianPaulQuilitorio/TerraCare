Vercel deployment setup for TerraCare Angular

Purpose
- Deploy the app as a static Angular SPA built to `dist/terracare-angular`.

Prerequisites
- Code pushed to a Git provider (GitHub/GitLab/Bitbucket) or local machine with Vercel CLI.
- Vercel account: https://vercel.com

Files of interest in this repo
- `vercel.json` — configured to use `@vercel/static-build` and output dir `dist/terracare-angular`.
- `.vercelignore` — excludes node_modules and dist to speed upload.
- `package.json` — contains `vercel-build` which runs `npm run build`.

Quick checks before deploying
1. Ensure `angular.json` has "outputPath": "dist/terracare-angular" for production.
2. Ensure `package.json` has these scripts:
   - `build`: builds production output
   - `vercel-build`: runs the build (already configured to `npm run build`).
3. Make sure `index.html` has `<base href="/">`.

Deploy via Vercel UI (recommended)
1. Push your repo to GitHub (or other supported Git provider).
2. Go to https://vercel.com/new and import the repository.
3. During import, set:
   - Root Directory: leave blank if repo root is this Angular project. If your Angular app lives in a subfolder (e.g. `terracare-angular`), set Root Directory to that subfolder.
   - Framework Preset: Other (or Angular)
   - Build Command: `npm run vercel-build`
   - Output Directory: `dist/terracare-angular`
4. Add Environment Variables (Project → Settings → Environment Variables) for any secrets you need:
   - `SUPABASE_URL` = (your project URL)
   - `SUPABASE_ANON_KEY` = (client anon key) — optional for client features
   - `SUPABASE_SERVICE_ROLE_KEY` = (server key) — only if using serverless APIs
   - `CEREBRAS_API_KEY` = (server-only AI API key) — set only for production and in Vercel settings
   - Mark server-only secrets as "Environment Variable" and ensure they are available in Production (don't commit secrets to source)
5. Deploy and inspect build logs.

If Vercel reports ENOENT: `/vercel/path0/package.json`
- This means Vercel used a different repository root than where `package.json` lives. Fix by either:
  A) Setting "Root Directory" on the Vercel import page to your Angular project folder (e.g. `terracare-angular`).
  B) Deploy from the correct folder via Vercel CLI:
     ```powershell
     # from your machine
     cd 'path/to/terracare-angular'
     vercel --prod --confirm
     ```
  C) (Not recommended) Add a thin root-level `package.json` at the repository root that forwards to the subfolder. Prefer A or B.

Deploy via Vercel CLI (alternate)
1. Install & login:
```powershell
npm i -g vercel
vercel login
```
2. From the project folder (where `package.json` is) run:
```powershell
cd 'd:\Assignments\Integrative Programming and Technologies\TerraCare\terracare-angular'
vercel --prod --confirm
```
3. To add environment variables via CLI:
```powershell
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
# follow prompts to paste the value
```

Troubleshooting
- If build fails with missing files, run locally: `npm ci && npm run vercel-build` and fix errors first.
- If a route refresh returns 404 on Vercel, verify `vercel.json` contains the catch-all route:
  `{ "src": "/(.*)", "dest": "/index.html" }`
- If you need server-side endpoints (AI proxy, Supabase operations), implement them as Vercel serverless functions under `/api` or enable SSR; choose one approach and configure `vercel.json` accordingly.

Optional: Make `api` functions work on Vercel
- If you want to retain server endpoints currently in `server.ts`:
  - Convert them to serverless functions placed under `/api/*.js` or `/api/*.mjs` — implement only the endpoints you need.
  - Keep secrets in Vercel Environment Variables and reference them in the functions.

If you want, I can:
- Prepare a PR that adds `.vercelignore` (done) and a short `VERCEL_SETUP.md` (done), and optionally add a sample serverless function for `/api/health` to validate serverless deployment.

