# Optimizer Service (FastAPI Stub)

This directory hosts a lightweight FastAPI implementation that emulates the Optimizer HTTP contract required in Week 2. It is intentionally simple (nearest-neighbor heuristic) but returns deterministic payloads so the TypeScript client can be developed and tested locally.

## Requirements
- Python 3.11 (see repository `.python-version`)
- `pip` or `uv` for dependency installation

## Setup
```bash
cd services/optimizer-py
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install -e .
```

## Run
```bash
uvicorn optimizer_service.main:app --reload --port 8001
```

The service exposes:
- `GET /health`: simple readiness probe
- `POST /optimize`: accepts the optimizer contract and returns a route ordering

Set `OPTIMIZER_SERVICE_URL=http://localhost:8001` in `.env.local` so the monorepo can call this stub.

## Sample request
```bash
curl -X POST http://localhost:8001/optimize \
  -H 'Content-Type: application/json' \
  -d '{
    "origin": {"lat": 35.681236, "lng": 139.767125},
    "destinations": [
      {"id": "tokyo-tower", "label": "Tokyo Tower", "lat": 35.6586, "lng": 139.7454},
      {"id": "shibuya", "label": "Shibuya", "lat": 35.6595, "lng": 139.7005}
    ],
    "options": {"strategy": "quality", "max_runtime_seconds": 30}
  }'
```

The response contains `visit_order`, `ordered_stops`, `total_distance_m`, `total_duration_s`, and diagnostics (iterations, gap, solver, fallback flag).

> **Note**: This stub does not run OR-Tools. It exists solely to unblock Week 2 development and should be replaced by the production-grade Python service later.
