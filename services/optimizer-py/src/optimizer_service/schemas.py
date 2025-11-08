from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, model_validator


class Coordinates(BaseModel):
  lat: float = Field(..., ge=-90.0, le=90.0)
  lng: float = Field(..., ge=-180.0, le=180.0)


class DestinationStop(Coordinates):
  id: str = Field(..., min_length=1)
  label: Optional[str] = None


class DistanceMatrix(BaseModel):
  meters: List[List[float]] = Field(default_factory=list)
  seconds: List[List[float]] = Field(default_factory=list)

  @model_validator(mode="after")
  def validate_shape(self) -> "DistanceMatrix":
    if len(self.meters) != len(self.seconds):
      raise ValueError("meters and seconds matrices must have the same dimension")
    for idx, row in enumerate(self.meters):
      if len(row) != len(self.seconds[idx]):
        raise ValueError("meters and seconds rows must align")
    return self


class OptimizerOptions(BaseModel):
  strategy: Literal["fast", "quality"] = "quality"
  max_iterations: int = Field(default=4000, ge=10, le=10000)
  max_runtime_seconds: int = Field(default=30, ge=1, le=60)
  fallback_tolerance: float = Field(default=0.15, ge=0.0, le=1.0)


class OptimizeRequest(BaseModel):
  origin: Coordinates
  destinations: List[DestinationStop] = Field(..., min_length=1, max_length=30)
  distance_matrix: Optional[DistanceMatrix] = None
  options: OptimizerOptions = Field(default_factory=OptimizerOptions)


class OrderedStop(DestinationStop):
  sequence: int
  distance_from_previous_m: int
  duration_from_previous_s: int
  cumulative_distance_m: int
  cumulative_duration_s: int


class Diagnostics(BaseModel):
  strategy: Literal["fast", "quality"]
  solver: str
  iterations: int
  gap: float
  fallback_used: bool
  execution_ms: int


class OptimizeResponse(BaseModel):
  route_id: str
  visit_order: List[str]
  ordered_stops: List[OrderedStop]
  total_distance_m: int
  total_duration_s: int
  diagnostics: Diagnostics
