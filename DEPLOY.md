# Deploy DocAgent (free hosting)

Host the **backend on Render** and **frontend on Vercel**. Supabase is already set up.

## Before you start

- [ ] Code pushed to a **GitHub** repository
- [ ] Supabase schema applied (`server/src/db/schema.sql`)
- [ ] Gemini API key ready
- [ ] Supabase URL + service role key ready

---

## Step 1 — Push to GitHub

From the project root:

```bash
git add .
git commit -m "DocAgent: LangGraph RAG portfolio app"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/docagent.git
git push -u origin main
```

Replace `YOUR_USERNAME/docagent` with your repo URL.

---

## Step 2 — Deploy backend (Render)

1. Go to [render.com](https://render.com) → **Sign up** (free) → connect GitHub.
2. Click **New +** → **Blueprint** (or **Web Service**).
3. Select your `docagent` repo.
4. If using **Blueprint**, Render reads [`render.yaml`](render.yaml) automatically.
5. Set these **secret** env vars when prompted:

| Variable | Value |
|----------|--------|
| `GOOGLE_API_KEY` | Your Gemini key |
| `SUPABASE_URL` | `https://xxxxx.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase → Settings → API |
| `CORS_ORIGIN` | Leave blank for now — update after Step 3 |

6. Click **Deploy**. Wait ~5 minutes.
7. Copy your API URL, e.g. `https://docagent-api.onrender.com`
8. Test: `https://docagent-api.onrender.com/api/health` → should show `"supabase": true`

**Note:** Render free tier sleeps after ~15 min idle. First request may take 30–60s to wake up.

---

## Step 3 — Deploy frontend (Vercel)

1. Go to [vercel.com](https://vercel.com) → **Sign up** → connect GitHub.
2. **Add New Project** → import your `docagent` repo (**frontend only** — keep the API on Render).
3. In project settings (**important** — clear old overrides):
   - **Root Directory:** leave **empty** (repo root), not `web`
   - **Build Command:** leave empty / use project setting default so [`vercel.json`](vercel.json) applies (`npm run build -w web`)
   - **Output Directory:** leave empty (vercel.json sets `web/dist`)
   - **Install Command:** leave empty (`npm install`)
4. Add **Environment Variable**:

| Name | Value |
|------|--------|
| `VITE_API_URL` | `https://docagent-api.onrender.com` (your Render URL, **no** trailing slash) |

5. Click **Deploy**.
6. Copy your live URL, e.g. `https://docagent.vercel.app`

**Do not** deploy the Express `server/` folder as a separate Vercel project — that will fail. Backend stays on Render.

---

## Step 4 — Connect frontend ↔ backend (CORS)

1. Go back to **Render** → your service → **Environment**.
2. Update `CORS_ORIGIN` to your Vercel URL:
   ```
   https://docagent.vercel.app
   ```
   For local dev too, use comma-separated:
   ```
   https://docagent.vercel.app,http://localhost:5173
   ```
3. Save → Render redeploys automatically.

---

## Step 5 — Verify live demo

1. Open your Vercel URL
2. Upload a PDF
3. Ask: “What is this document about?”
4. First chat after idle may be slow (Render wake-up + Gemini)

---

## Portfolio links

Add to resume / LinkedIn:

```
DocAgent — Agentic RAG with LangGraph.js, Gemini, pgvector
Live demo: https://docagent.vercel.app
GitHub: https://github.com/YOUR_USERNAME/docagent
```

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| CORS error in browser | Set `CORS_ORIGIN` on Render to exact Vercel URL (https, no trailing slash) |
| `Internal server error` on chat | Check Render logs; often Gemini rate limit — wait 1 min |
| Upload works locally but not live | Confirm Supabase env vars on Render |
| Vercel build fails (`Cannot resolve entry module index.html`) | Root Directory must be **empty**, not `web`. Clear Build Command override (`npx vite build` breaks at repo root). Redeploy. Delete any `docagent-server` Vercel project. |
| API health `supabase: false` | Wrong `SUPABASE_URL` or service role key on Render |

---

## Cost summary (all free tier)

| Service | Free tier |
|---------|-----------|
| Vercel | Frontend hosting |
| Render | Backend (sleeps when idle) |
| Supabase | Postgres + pgvector |
| Gemini | API quotas apply |
