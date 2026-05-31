# RoadWatch

RoadWatch is an AI-powered civic road issue reporting and transparency platform for Chennai, connecting citizen complaints, road metadata, authority routing, public works spending, and contractor risk signals in one interactive application.

![Frontend](https://img.shields.io/badge/frontend-React%20%2B%20Vite-38bdf8)
![Backend](https://img.shields.io/badge/backend-FastAPI-009688)
![Database](https://img.shields.io/badge/database-SQLAlchemy%20%2F%20SQLite%20or%20PostgreSQL-334155)
![Status](https://img.shields.io/badge/status-hackathon%20prototype-f59e0b)
![License](https://img.shields.io/badge/license-not%20specified-64748b)

## Problem Statement

Road maintenance complaints often disappear into disconnected channels: residents do not know who owns a road, authorities receive incomplete reports, and public works spending is difficult to compare against field conditions. RoadWatch addresses this gap by combining citizen reporting, road-level context, automated triage, authority assignment, and transparency analytics for Chennai roads.

The project is designed for reviewers, civic teams, hackathon judges, and contributors who need to understand where issues are reported, how they are routed, and which roads or contractors show signs of repeated infrastructure risk.

## Key Features

- Interactive Chennai road map using OpenStreetMap and Leaflet.
- Searchable road network with road type, ward, zone, health score, project, maintenance, authority, and complaint context.
- Multi-step complaint submission flow with road selection, GPS/manual coordinates, multi-issue selection, description validation, and optional photo evidence.
- Supabase Storage-backed image upload for complaint photos.
- AI complaint classification using Groq or Gemini for issue normalization, severity, urgency, safety risk, summary, and routing reasoning.
- Automatic authority routing based on road type and zone.
- SLA deadline assignment based on complaint severity.
- Complaint tracking page with status timeline, assigned authority, SLA, location, AI triage output, and uploaded media.
- Transparency dashboard with budget overview, complaint heatmap, contractor scorecard, and rule-based anomaly alerts.
- Seed data for roads, authorities, contractors, projects, and maintenance records under `data/`.

## Tech Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Frontend | React 19, Vite | Single-page application and development server |
| Routing | React Router | Map, dashboard, complaint, tracker, and road detail routes |
| Styling | Tailwind CSS | Utility-first responsive UI styling |
| Mapping | Leaflet, React Leaflet, OpenStreetMap tiles | Road network display and complaint density map |
| Charts | Recharts | Budget and dashboard visualizations |
| Backend API | FastAPI, Uvicorn | REST API for roads, complaints, authorities, and analytics |
| Data Access | SQLAlchemy | ORM models and database sessions |
| Database | SQLite by default, PostgreSQL-compatible via `DATABASE_URL` | Local development data and relational persistence |
| Storage | Supabase Storage | Complaint image uploads in the `complaint-media` bucket |
| AI / LLM | Groq or Gemini via HTTP APIs | Complaint classification and triage metadata |
| Seed Data | JSON files in `data/` | Demo records for Chennai roads and civic infrastructure entities |

## System Architecture

RoadWatch is split into a React frontend and a FastAPI backend.

The frontend renders the map-first civic interface, calls the backend through Axios, and uses `VITE_API_URL` to target the API. The backend exposes road lookup, complaint submission, authority lookup, and analytics endpoints. SQLAlchemy models persist road segments, project records, maintenance records, complaints, authorities, and contractors.

Complaint submission flows through AI classification before final submission. The classifier calls Groq when `GROQ_API_KEY` is configured, otherwise Gemini when `GEMINI_API_KEY` is configured. If an external model call fails after a provider is configured, the backend returns a heuristic fallback classification. If no AI provider key is configured, classification returns a `503` error.

Photo uploads are handled by the backend and stored in Supabase Storage. Analytics endpoints aggregate the database records into dashboard views for budget utilization, complaint density, contractor risk, and anomaly flags.

## Repository Structure

```text
RoadWatch/
|-- backend/
|   |-- main.py              # FastAPI app and router registration
|   |-- database.py          # SQLAlchemy engine/session setup
|   |-- models.py            # Database models
|   |-- schemas.py           # Pydantic request/response schemas
|   |-- seed.py              # Local database seeding script
|   |-- routers/             # API route modules
|   `-- services/            # Complaint classification and routing logic
|-- data/
|   |-- authorities.json
|   |-- contractors.json
|   |-- maintenance.json
|   |-- projects.json
|   `-- roads.json
|-- frontend/
|   |-- package.json
|   |-- vite.config.js
|   `-- src/
|       |-- api/             # Axios API clients
|       |-- components/      # Navigation and road detail UI
|       `-- pages/           # Map, dashboard, complaint, tracker pages
`-- ml/
    `-- .gitkeep             # Placeholder for future ML assets
```

## Local Setup

### Prerequisites

- Python 3.10+
- Node.js 18+
- npm
- Optional: Supabase project for image uploads
- Optional: Groq or Gemini API key for AI classification

### 1. Clone the Repository

```bash
git clone <repository-url>
cd RoadWatch
```

### 2. Configure Backend Environment

Create `backend/.env`:

```env
DATABASE_URL=sqlite:///./roadwatch.db
GROQ_API_KEY=your-groq-api-key
GEMINI_API_KEY=your-gemini-api-key
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

Only one of `GROQ_API_KEY` or `GEMINI_API_KEY` is required for complaint classification. Supabase variables are required only when using photo uploads.

### 3. Install and Seed the Backend

```bash
cd backend
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

pip install -r requirements.txt
python seed.py
```

The seed script creates the database tables and loads demo records from `data/`.

### 4. Run the Backend API

```bash
uvicorn main:app --reload
```

The API runs at:

```text
http://127.0.0.1:8000
```

Health checks:

```text
GET /
GET /health
```

### 5. Configure Frontend Environment

Create `frontend/.env` if the backend is not running at the default URL:

```env
VITE_API_URL=http://127.0.0.1:8000
```

### 6. Install and Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server is configured for:

```text
http://127.0.0.1:5173
```

## Environment Variables

### Backend

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | No | SQLAlchemy database URL. Defaults to `sqlite:///./roadwatch.db`. |
| `GROQ_API_KEY` | Conditional | Enables Groq-based complaint classification. Preferred when present. |
| `GEMINI_API_KEY` | Conditional | Enables Gemini-based complaint classification when Groq is not configured. |
| `SUPABASE_URL` | For uploads | Supabase project URL used for complaint media storage. |
| `SUPABASE_SERVICE_ROLE_KEY` | For uploads | Server-side Supabase key used to upload complaint images. |

### Frontend

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | No | Backend API base URL. Defaults to `http://127.0.0.1:8000`. |

## API Overview

| Area | Endpoint | Description |
| --- | --- | --- |
| Health | `GET /health` | API health response |
| Roads | `GET /roads` | List road segments |
| Roads | `GET /roads/search?q=...` | Search roads by name |
| Roads | `GET /roads/nearby` | Find roads near coordinates |
| Roads | `GET /roads/{road_id}` | Road detail with project, maintenance, authority, and complaint summary |
| Complaints | `POST /complaints/classify` | AI triage for complaint text and issue types |
| Complaints | `POST /complaints/upload-image` | Upload complaint image to Supabase Storage |
| Complaints | `POST /complaints` | Create and route a complaint |
| Complaints | `GET /complaints/{complaint_id}` | Track complaint details |
| Complaints | `POST /complaints/{complaint_id}/route` | Route or re-route a complaint |
| Authorities | `GET /authorities` | List configured civic authorities |
| Analytics | `GET /analytics/budget-overview` | Budget totals by road and contractor |
| Analytics | `GET /analytics/complaint-heatmap` | Complaint density points |
| Analytics | `GET /analytics/contractor-scores` | Contractor risk and performance bands |
| Analytics | `GET /analytics/anomalies` | Rule-based road and contractor anomaly alerts |

## How to Use the App

1. Open the frontend at `http://127.0.0.1:5173`.
2. Use the map or search bar to inspect Chennai road segments.
3. Select a road to view health score, budget, maintenance, authority, and complaint context.
4. Choose **Report Issue** from the road panel or navigation.
5. Allow browser geolocation or enter latitude and longitude manually.
6. Select one or more issue types and enter a complaint description.
7. Optionally upload a JPG, PNG, or WebP photo up to 5 MB.
8. Review the AI-normalized complaint details.
9. Submit the complaint and copy the generated complaint ID.
10. Track status, authority assignment, SLA, AI triage, and media from the complaint tracker page.
11. Use the dashboard to review budgets, complaint hotspots, contractor risk, and anomaly alerts.

## AI / ML Workflow

RoadWatch currently implements LLM-based complaint triage in `backend/services/classifier.py`.

The classifier:

- accepts the citizen description, selected issue types, and optional road context;
- normalizes issue types to the supported categories;
- assigns severity as `Low`, `Medium`, `High`, or `Critical`;
- detects whether the complaint suggests an immediate safety risk;
- calculates an urgency score from 1 to 10;
- generates a short English summary and routing reasoning;
- uses Groq first when configured, otherwise Gemini;
- falls back to a deterministic heuristic if a configured provider fails or returns invalid JSON.

The current repository does not include a YOLO defect detection model or image inference pipeline. The `ml/` directory is a placeholder for future training or model assets.

## Dashboard and Analytics

The dashboard is powered by backend aggregation endpoints and presents:

- budget overview by road and contractor, including sanctioned and spent amounts;
- complaint heatmap markers based on submitted complaint coordinates;
- contractor scorecard with complaint counts, repeat repairs, risk scores, and performance bands;
- anomaly alerts for repeated complaints after recent repairs, high spend with repeated failures, poor health after recent work, and contractors with multiple flagged roads.

These analytics are rule-based and derived from the local database records.

## Development Notes

- Keep backend and frontend changes in their respective folders.
- Use feature branches for changes and keep `main` stable.
- Run `python seed.py` after changing seed data or database model fields.
- Do not commit local `.env`, virtual environments, `node_modules/`, build output, or generated SQLite database files.
- The backend CORS configuration currently allows local Vite origins on ports `5173` and `5174`.
- There is no production deployment configuration in the repository at this time.

## Testing and Verification

The repository does not currently include an automated test suite or CI workflow. Practical local verification should include:

```bash
# Backend import/compile check
cd backend
python -m compileall .

# Frontend production build
cd ../frontend
npm run build
```

Recommended manual checks:

- backend health endpoint returns `{"status":"ok","project":"RoadWatch"}`;
- seed data loads without errors;
- map renders roads from the backend;
- complaint classification succeeds with a configured Groq or Gemini key;
- complaint submission creates a routed complaint with an SLA deadline;
- dashboard sections load from the analytics endpoints.

## Contributing

1. Fork the repository or create a feature branch.
2. Keep changes focused and aligned with the existing React/FastAPI structure.
3. Update documentation when behavior, environment variables, or setup steps change.
4. Run the relevant backend and frontend checks before opening a pull request.
5. Avoid committing secrets, generated artifacts, or local dependency folders.

## License

No license file is currently included. License information can be added here.
