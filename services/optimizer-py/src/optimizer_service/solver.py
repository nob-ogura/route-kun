from __future__ import annotations

import math
from typing import List, Sequence, Tuple

from .schemas import Coordinates, DestinationStop, OrderedStop

AVG_SPEED_MPS = 13.8889  # ~= 50km/h average urban driving


def _haversine(a: Coordinates, b: Coordinates) -> float:
  r = 6371000  # meters
  lat1, lon1 = math.radians(a.lat), math.radians(a.lng)
  lat2, lon2 = math.radians(b.lat), math.radians(b.lng)
  dlat = lat2 - lat1
  dlon = lon2 - lon1
  h = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
  return 2 * r * math.asin(math.sqrt(h))


def _to_int(value: float) -> int:
  return int(round(value))


def nearest_neighbor(origin: Coordinates, stops: Sequence[DestinationStop]) -> Tuple[List[str], List[OrderedStop], int, int]:
  remaining = list(stops)
  visit_order: List[str] = []
  ordered: List[OrderedStop] = []
  current = origin
  total_distance = 0.0
  total_duration = 0.0
  sequence = 1

  while remaining:
    leg_distances = [_haversine(current, candidate) for candidate in remaining]
    best_idx = min(range(len(remaining)), key=lambda idx: leg_distances[idx])
    best_stop = remaining.pop(best_idx)
    leg_distance = leg_distances[best_idx]
    leg_duration = leg_distance / AVG_SPEED_MPS

    total_distance += leg_distance
    total_duration += leg_duration

    ordered.append(
      OrderedStop(
        id=best_stop.id,
        label=best_stop.label,
        lat=best_stop.lat,
        lng=best_stop.lng,
        sequence=sequence,
        distance_from_previous_m=_to_int(leg_distance),
        duration_from_previous_s=_to_int(leg_duration),
        cumulative_distance_m=_to_int(total_distance),
        cumulative_duration_s=_to_int(total_duration),
      )
    )
    visit_order.append(best_stop.id)
    current = best_stop
    sequence += 1

  return visit_order, ordered, _to_int(total_distance), _to_int(total_duration)
