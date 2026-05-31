# RoadWatch YOLO Defect Detection

This folder contains lightweight YOLOv8 training and inference utilities for road-defect detection. Training is expected to happen on a stronger machine with a GPU. The RoadWatch app will still run without a trained model.

## Train On Another Machine

1. Export or download a pothole / road-defect dataset in YOLOv8 format. Roboflow exports usually include a `data.yaml` file.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Run training with a local `data.yaml` path:

```bash
python train.py --data "C:/datasets/pothole/data.yaml"
```

You can also pass a folder containing `data.yaml`:

```bash
python train.py --data "C:/datasets/pothole"
```

Defaults are `yolov8n.pt`, 50 epochs, image size 640, batch 16, and run name `roadwatch-yolo`.

## Hand Back The Model

After training, the script prints the run directory and weights paths. Copy:

```text
runs/detect/roadwatch-yolo/weights/best.pt
```

into this repository as:

```text
ml/weights/best.pt
```

The backend also checks these fallback paths:

```text
ml/runs/detect/roadwatch-yolo/weights/best.pt
ml/runs/detect/train/weights/best.pt
```

## Test Inference

```bash
python inference.py --image path/to/test.jpg --model weights/best.pt
```

The command prints JSON with detections, labels, confidence, bounding boxes, and a simple severity band.

## No Model Yet

If `best.pt` is missing or `ultralytics` is not installed, inference returns a graceful fallback result. The complaint form remains usable with manual issue selection.
