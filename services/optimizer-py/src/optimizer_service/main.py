from __future__ import annotations

import time
from uuid import uuid4

from fastapi import FastAPI

from .schemas import Diagnostics, OptimizeRequest, OptimizeResponse
from .solver import nearest_neighbor

app = FastAPI(title="RouteKun Optimizer Stub", version="0.1.0")


@app.get("/health")
def health() -> dict[str, str]:
  return {"status": "ok"}


@app.post("/optimize", response_model=OptimizeResponse)
def optimize(payload: OptimizeRequest) -> OptimizeResponse:
  start = time.perf_counter()
  visit_order, ordered, total_distance, total_duration = nearest_neighbor(payload.origin, payload.destinations)
  duration_ms = max(int((time.perf_counter() - start) * 1000), 1)
  iterations = max(len(visit_order) * (200 if payload.options.strategy == "quality" else 100), 1)
  gap = 0.01 if payload.options.strategy == "quality" else 0.05

  diagnostics = Diagnostics(
    strategy=payload.options.strategy,
    solver="nearest_neighbor_stub",
    iterations=iterations,
    gap=gap,
    fallback_used=False,
    execution_ms=duration_ms,
  )

  return OptimizeResponse(
    route_id=str(uuid4()),
    visit_order=visit_order,
    ordered_stops=ordered,
    total_distance_m=total_distance,
    total_duration_s=total_duration,
    diagnostics=diagnostics,
  )
