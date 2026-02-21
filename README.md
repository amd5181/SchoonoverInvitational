# Schoonover Invitational Golf Hub

Fantasy golf platform for the four major championships. One repo, one Vercel deployment.

## Stack

- **Frontend** — React 18 + Vite + Tailwind CSS + shadcn/ui
- **Backend** — FastAPI (Python), served as Vercel serverless functions
- **Database** — Supabase (Postgres)

---

## Deploy to Vercel (One Click)

### Step 1 — Push to GitHub

Push this repo to GitHub as-is.

### Step 2 — Create a Vercel Project

1. Go to [vercel.com](https://vercel.com) → **Add New Project**
2. Import your GitHub repo
3. **Leave Root Directory as `/`** (default)
4. Vercel will detect the `vercel.json` automatically. Hit **Deploy**

### Step 3 — Add Environment Variables

In your Vercel project: **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Your Supabase anon key |
| `ADMIN_PIN` | Your 4-digit admin PIN (default: `3669`) |

Then click **Redeploy**. You're live. ✅

> **No `VITE_BACKEND_URL` needed** — the frontend and API are on the same domain in production, so all `/api/*` requests route automatically.

---

## Local Development

### Backend

```bash
python -m venv venv
source venv/bin/activate    # Windows: venv\Scripts\activate
pip install -r api/requirements.txt

# Create a .env file at the repo root
cp .env.example .env
# Fill in SUPABASE_URL and SUPABASE_KEY

uvicorn api.server:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install

# Tell Vite where the local API is
cp .env.example .env.local
# .env.local already has VITE_BACKEND_URL=http://localhost:8000

npm run dev
# App at http://localhost:5173
```

---

## Project Structure

```
steelsonsgolf/
├── vercel.json              ← Single deployment config (routes /api/* + SPA)
├── .env.example             ← Environment variable reference
│
├── api/
│   ├── index.py             ← Vercel serverless entry (Mangum adapter)
│   ├── server.py            ← FastAPI app + all routes
│   ├── supabase_mongo_compat.py
│   ├── supabase_schema.sql
│   └── requirements.txt
│
└── frontend/
    ├── index.html
    ├── vite.config.js       ← Vite build (outputs to frontend/dist/)
    ├── tailwind.config.js
    ├── package.json
    └── src/
        ├── App.jsx
        ├── main.jsx
        ├── pages/           ← Login, Home, MyTeams, Leaderboard, History, Rules, Admin
        └── components/      ← Layout, ProfileModal, shadcn/ui
```

---

## How it Works (One Deployment)

`vercel.json` tells Vercel to:
1. **Build** the frontend: `cd frontend && npm install && npm run build`
2. **Serve** `frontend/dist/` as the static site
3. **Route** `/api/*` requests → `api/index.py` (Python serverless function)
4. **Route** everything else → `index.html` (React SPA client-side routing)

Frontend and API share the same domain, so no CORS config is needed.
