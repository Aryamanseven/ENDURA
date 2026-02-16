# ENDURA.RUN

Monorepo implementing the ENDURA.RUN sidecar architecture:

- `apps/frontend` — React + Tailwind dashboard (upload, charts, map)
- `apps/server` — Node.js + Express manager API (upload + MongoDB persistence + ML delegation)
- `apps/ml-service` — FastAPI ML sidecar (`/predict`, `/train`)

## Architecture

`Client -> Node API -> MongoDB + FastAPI ML Sidecar -> Node API -> Client`

## API Contracts

### Node API (port 5000)

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/google`
- `POST /api/runs/upload` (multipart `gpx`)
- `POST /api/runs/train` (one-click retrain from MongoDB runs)
- `GET /api/runs`
- `GET /api/runs/:id`
- `DELETE /api/runs/:id`
- `GET /api/certificates`
- `POST /api/certificates`
- `GET /api/certificates/:id/file`
- `DELETE /api/certificates/:id`

### Python ML API (port 8000)

- `POST /predict`
- `POST /train`

### Personalized Prediction Behavior

- `POST /predict` blends three signals:
	- Global model prediction
	- User-history projection from the runner's own previous runs
	- Similar-runner cohort projection (pace/distance neighborhood)
- Elevation and recent load drive `fatigue_factor`, which adjusts final marathon-time prediction.
- Response includes:
	- `predicted_marathon_time` (seconds)
	- `predicted_times` (`five_k`, `ten_k`, `half_marathon`, `twenty_five_k`, `marathon`)
	- `fatigue_factor`
	- `confidence` (0-1)
	- `model_source` (`global`, `cohort-blend`, or `personalized`)

### Model Source Meanings

- `global`: prediction is dominated by the shared global model trained on aggregate running patterns.
- `cohort-blend`: prediction blends global model with similar-runner cohort history.
- `personalized`: prediction is dominated by the user's own run history (recency-weighted).

### Retraining

- `POST /train` accepts optional real samples via `runs`.
- If at least 10 samples are provided, model trains from those runs; otherwise it falls back to synthetic bootstrap data.
- `POST /api/runs/train` in Node automates this by fetching run history from MongoDB and forwarding it to ML `/train`.
	- Optional body: `{ "user_id": "...", "algorithm": "gradient_boosting" }`
	- Without `user_id`, it trains on all users' runs.

## Quick Start (Windows PowerShell)

### 1) Start ML service

```powershell
cd .\apps\ml-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 2) Start Node server

```powershell
cd .\apps\server
npm install
copy .env.example .env
npm run dev
```

### 3) Start React frontend

```powershell
cd .\apps\frontend
npm install
npm run dev
```

## Notes

- Register/login first. Runs and certificates are scoped to the authenticated user via Bearer token.
- Uploaded GPX XML is stored in MongoDB (`gpx_raw`) and also stored on disk path (`gpx_file_url`).
- Certificates support optional file upload in `pdf`, `jpeg`, `jpg`, or `png` format.
- Certificate form auto-fill reads uploaded files (OCR/text extraction) and pre-populates detected fields.
- Security hardening includes JWT auth, `helmet` headers, auth rate limiting, MIME/extension filters, and certificate upload size cap (10MB).
- Ensure MongoDB Atlas URI is set in `apps/server/.env`.

## Environment

- Server: copy `apps/server/.env.example` to `apps/server/.env` and set real values.
- Frontend: copy `apps/frontend/.env.example` to `apps/frontend/.env` and set `VITE_GOOGLE_CLIENT_ID`.
