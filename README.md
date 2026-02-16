# ENDURA.RUN

Full-stack running analytics platform with ML-powered marathon predictions.

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + Tailwind CSS |
| Auth | [Clerk](https://clerk.com) (email, Google, etc.) |
| Backend API | Node.js + Express |
| Database | [Supabase](https://supabase.com) (Postgres) |
| File Storage | Supabase Storage (GPX, certificates, avatars) |
| ML Service | FastAPI + scikit-learn sidecar |
| Deployment | Vercel (frontend) · Render (backend + ML) |

## Monorepo Structure

```
apps/
  frontend/   — React + Tailwind dashboard
  server/     — Express API (Clerk auth + Supabase)
  ml-service/ — FastAPI ML sidecar (/predict, /train)
```

## Architecture

```
Browser → Clerk Auth → React SPA → Express API → Supabase Postgres
                                        ↕
                                  FastAPI ML Sidecar
```

---

## Setup

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor → New Query** and paste the contents of `apps/server/supabase/schema.sql`, then run it
3. Go to **Storage** and create three buckets:
   - `gpx-files` (private)
   - `certificates` (private)
   - `avatars` (public)
4. Copy **Project URL** and **service_role key** from Settings → API

### 2. Clerk

1. Create an application at [clerk.com](https://clerk.com)
2. Enable Email + Password sign-in (and optionally Google, GitHub, etc.)
3. Copy the **Publishable Key** (`pk_test_...`) and **Secret Key** (`sk_test_...`)

### 3. Environment Variables

**`apps/server/.env`**
```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
CLERK_SECRET_KEY=sk_test_...
CLERK_PUBLISHABLE_KEY=pk_test_...
ML_SERVICE_URL=http://localhost:8001
PORT=5000
CORS_ORIGIN=http://localhost:5173
```

**`apps/frontend/.env`**
```env
VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
VITE_SERVER_URL=http://localhost:5000
```

### 4. Run Locally

```powershell
# ML Service
cd apps/ml-service
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001

# Backend
cd apps/server
npm install
npm run dev

# Frontend
cd apps/frontend
npm install
npm run dev
```

---

## Deployment

### Frontend → Vercel

1. Connect your GitHub repo to [vercel.com](https://vercel.com)
2. Set **Root Directory** to `apps/frontend`
3. Set **Build Command** to `npm run build` and **Output Directory** to `dist`
4. Add env vars: `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SERVER_URL` (your Render backend URL)

### Backend → Render

1. Create a new **Web Service** from your GitHub repo
2. Set **Root Directory** to `apps/server`
3. Set **Build Command** to `npm install` and **Start Command** to `node src/index.js`
4. Add all env vars from `apps/server/.env.example`
5. Set `CORS_ORIGIN` to your Vercel frontend URL

### ML Service → Render

1. Create a new **Web Service**, root directory `apps/ml-service`
2. **Build Command**: `pip install -r requirements.txt`
3. **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
4. Set the backend's `ML_SERVICE_URL` to this service's URL

---

## API Routes

### Auth
- `POST /api/auth/sync` — Upserts user profile after Clerk sign-in

### Runs
- `POST /api/runs/upload` — Upload GPX file
- `GET /api/runs` — List runs
- `GET /api/runs/stats` — Aggregated stats
- `GET /api/runs/:id` — Run detail
- `DELETE /api/runs/:id` — Delete run
- `POST /api/runs/train` — Retrain ML model

### Certificates
- `GET /api/certificates` — List certificates
- `POST /api/certificates` — Upload certificate
- `GET /api/certificates/:id/file` — Download file
- `DELETE /api/certificates/:id` — Delete certificate

### Account
- `GET /api/account/profile` — Get profile
- `PUT /api/account/profile` — Update profile
- `POST /api/account/profile-picture` — Upload avatar
- `GET /api/account/profile-picture` — Get avatar
- `DELETE /api/account/profile-picture` — Remove avatar
- `DELETE /api/account` — Delete account + all data

### ML Sidecar (port 8001)
- `POST /predict` — Marathon time prediction
- `POST /train` — Retrain model

---

## ML Prediction

The `/predict` endpoint blends three signals:
- **Global model** — trained on aggregate running patterns
- **User-history projection** — from the runner's own previous runs
- **Cohort projection** — pace/distance neighborhood of similar runners

Elevation and recent load drive a `fatigue_factor` that adjusts the final prediction.

## Notes

- Runs and certificates are scoped to the authenticated user via Clerk JWT
- GPX files are stored in Supabase Storage; raw XML is also saved in the `gpx_raw` column
- Certificates support PDF, JPEG, JPG, PNG upload (10 MB limit) with OCR auto-fill
- Password management, 2FA, and social login are handled entirely by Clerk

## Environment

- Server: copy `apps/server/.env.example` to `apps/server/.env` and set real values.
- Frontend: copy `apps/frontend/.env.example` to `apps/frontend/.env` and set `VITE_GOOGLE_CLIENT_ID`.
