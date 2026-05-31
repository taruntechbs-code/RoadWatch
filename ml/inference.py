from argparse import ArgumentParser
import json
from pathlib import Path


ML_DIR = Path(__file__).resolve().parent
DEFAULT_MODEL_PATHS = [
    ML_DIR / "weights" / "best.pt",
    ML_DIR / "runs" / "detect" / "roadwatch-yolo" / "weights" / "best.pt",
    ML_DIR / "runs" / "detect" / "train" / "weights" / "best.pt",
]


def _unavailable(message):
    return {
        "model_available": False,
        "detections": [],
        "detected_labels": [],
        "max_confidence": None,
        "severity_band": None,
        "message": message,
    }


def resolve_model_path(model_path: str | None = None) -> Path | None:
    candidates = [Path(model_path).expanduser()] if model_path else DEFAULT_MODEL_PATHS
    for candidate in candidates:
        if candidate.exists():
            return candidate
    return None


def _severity_band(max_confidence, detections, image_shape):
    if not detections:
        return "None"

    if len(detections) > 3:
        return "Critical"

    image_area = None
    if image_shape and len(image_shape) >= 2:
        image_area = float(image_shape[0] * image_shape[1])

    if image_area:
        for detection in detections:
            x1, y1, x2, y2 = detection["bbox"]
            bbox_area = max(0.0, x2 - x1) * max(0.0, y2 - y1)
            if bbox_area / image_area >= 0.25:
                return "Critical"

    if max_confidence < 0.40:
        return "Low"
    if max_confidence < 0.70:
        return "Medium"
    return "High"


def detect_defects(image_path: str, model_path: str | None = None) -> dict:
    resolved_model = resolve_model_path(model_path)
    if not resolved_model:
        return _unavailable("YOLO model not available. Manual issue selection required.")

    try:
        from ultralytics import YOLO
    except ImportError:
        return _unavailable("YOLO dependencies not installed. Manual issue selection required.")

    model = YOLO(str(resolved_model))
    results = model(str(image_path), verbose=False)
    result = results[0] if results else None
    detections = []

    if result and result.boxes is not None:
        names = result.names or {}
        for box in result.boxes:
            label_id = int(box.cls[0].item())
            label = str(names.get(label_id, label_id))
            confidence = float(box.conf[0].item())
            bbox = [float(value) for value in box.xyxy[0].tolist()]
            detections.append(
                {
                    "label": label,
                    "confidence": round(confidence, 4),
                    "bbox": [round(value, 2) for value in bbox],
                }
            )

    detected_labels = sorted({detection["label"] for detection in detections})
    max_confidence = max((detection["confidence"] for detection in detections), default=None)
    image_shape = getattr(result, "orig_shape", None) if result else None
    severity_band = _severity_band(max_confidence, detections, image_shape)
    count = len(detections)

    return {
        "model_available": True,
        "detections": detections,
        "detected_labels": detected_labels,
        "max_confidence": max_confidence,
        "severity_band": severity_band,
        "message": f"{count} defect{'s' if count != 1 else ''} detected",
    }


def parse_args():
    parser = ArgumentParser(description="Run RoadWatch YOLO defect inference.")
    parser.add_argument("--image", required=True, help="Path to an image file.")
    parser.add_argument("--model", default=None, help="Optional path to best.pt.")
    return parser.parse_args()


def main():
    args = parse_args()
    print(json.dumps(detect_defects(args.image, args.model), indent=2))


if __name__ == "__main__":
    main()
