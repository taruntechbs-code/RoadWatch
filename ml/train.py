"""
RoadWatch YOLOv8 training helper.

For the training machine:
1. Install dependencies: pip install -r requirements.txt
2. Download/export a pothole or road-defect dataset from Roboflow in YOLOv8 format.
3. Run, for example:
   python train.py --data "C:/datasets/pothole/data.yaml"
4. After training, copy the printed best.pt file back into this repo at:
   ml/weights/best.pt

Training is expected to run on a stronger machine. This script is intentionally
small and uses the Ultralytics Python API so it is easy to rerun and inspect.
"""

from argparse import ArgumentParser
from pathlib import Path

from ultralytics import YOLO


def resolve_data_yaml(data_arg: str) -> Path:
    data_path = Path(data_arg).expanduser()
    if data_path.is_dir():
        data_path = data_path / "data.yaml"
    if not data_path.exists() or data_path.name != "data.yaml":
        raise FileNotFoundError(f"YOLO data.yaml not found: {data_path}")
    return data_path


def parse_args():
    parser = ArgumentParser(description="Train a YOLOv8 road-defect detector for RoadWatch.")
    parser.add_argument("--data", required=True, help="Path to YOLO data.yaml or a folder containing data.yaml.")
    parser.add_argument("--model", default="yolov8n.pt", help="Base YOLO model to fine-tune.")
    parser.add_argument("--epochs", default=50, type=int)
    parser.add_argument("--imgsz", default=640, type=int)
    parser.add_argument("--batch", default=16, type=int)
    parser.add_argument("--project", default="runs/detect")
    parser.add_argument("--name", default="roadwatch-yolo")
    parser.add_argument("--device", default=None, help='Optional device, e.g. "0" for GPU or "cpu".')
    return parser.parse_args()


def main():
    args = parse_args()
    data_yaml = resolve_data_yaml(args.data)

    model = YOLO(args.model)
    train_kwargs = {
        "data": str(data_yaml),
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "batch": args.batch,
        "project": args.project,
        "name": args.name,
        "task": "detect",
    }
    if args.device:
        train_kwargs["device"] = args.device

    results = model.train(**train_kwargs)
    save_dir = Path(getattr(results, "save_dir", Path(args.project) / args.name))
    best_path = save_dir / "weights" / "best.pt"
    last_path = save_dir / "weights" / "last.pt"

    print(f"Run directory: {save_dir}")
    print(f"Best weights: {best_path}")
    print(f"Last weights: {last_path}")
    print("Copy best.pt to ml/weights/best.pt for RoadWatch inference.")


if __name__ == "__main__":
    main()
