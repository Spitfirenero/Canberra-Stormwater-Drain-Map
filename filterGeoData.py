import json
import argparse
from typing import Any


def _to_float(value: Any) -> float | None:
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        s = value.strip()
        if not s:
            return None
        try:
            return float(s)
        except ValueError:
            return None
    return None


def convertMMtoM(value: Any) -> float | None:
    mm_value = _to_float(value)
    if mm_value is None:
        return None
    return mm_value / 1000.0

def filterByDiameter(data: dict, diameter_m: float, property_name: str = "PIPE_DIAMETER") -> dict:
    features = data.get("features")
    if not isinstance(features, list):
        raise ValueError("Expected GeoJSON FeatureCollection with a 'features' list")

    filtered_features: list[dict] = []
    for feature in features:
        if not isinstance(feature, dict):
            continue

        properties = feature.get("properties")
        if not isinstance(properties, dict):
            continue

        feature_diameter = convertMMtoM(properties.get(property_name))
        if feature_diameter is None:
            continue

        if feature_diameter >= diameter_m:
            filtered_features.append(feature)

    filtered_data = dict(data)
    filtered_data["features"] = filtered_features
    return filtered_data

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Filter a GeoJSON FeatureCollection by minimum pipe diameter (converted from mm to metres)."
    )
    parser.add_argument("--input", default="data.geojson", help="Input GeoJSON path")
    parser.add_argument("--output", default="filtered_data.geojson", help="Output GeoJSON path")
    parser.add_argument(
        "--property",
        default="PIPE_DIAMETER",
        help="Feature property containing diameter in millimetres",
    )
    parser.add_argument(
        "--min-diameter-m",
        type=float,
        default=0.6,
        help="Minimum diameter in metres (floor is typically 0.6 for the static site)",
    )
    args = parser.parse_args()

    if args.min_diameter_m < 0:
        raise SystemExit("--min-diameter-m must be >= 0")

    with open(args.input, encoding="utf-8") as f:
        data = json.load(f)

    filteredData = filterByDiameter(data, args.min_diameter_m, property_name=args.property)
    print(
        f"Filtered {len(data.get('features', []))} -> {len(filteredData.get('features', []))} features "
        f"(min {args.min_diameter_m} m via {args.property})"
    )

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(filteredData, f)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())