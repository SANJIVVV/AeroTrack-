# AeroTrack Pro — Delay-Risk Machine Learning Pipeline

This directory contains the machine-learning pipeline for training explainable delay-risk models for airport baggage tracking.

---

## 1. Why Logistic Regression?

In an academic and operational baggage tracking system, **transparency and explainability** are critical:
- Airport ground operations staff need to understand *why* a particular bag is flagged as high risk.
- Logistic regression produces weighted additive linear log-odds:
  $$z = \beta_0 + \sum_{i=1}^k \beta_i \left( \frac{x_i - \mu_i}{\sigma_i} \right)$$
  $$\hat{P}(\text{delayed}) = \frac{1}{1 + e^{-z}}$$
- Each factor's exact positive contribution $c_i = x_i \cdot \beta_i$ can be surfaced in the passenger and staff user interface (e.g. "Dwell time at security exceeded threshold (+0.25)", "Flight reported delayed (+0.15)").
- Complex black-box models (deep neural nets, gradient boosted ensembles) lack this immediate inspectability.

---

## 2. Feature Vector Design

The model operates on a 9-dimensional normalized feature vector:

| Feature Name | Description | Value Range |
|---|---|---|
| `stageIndex` | Current journey stage in the main flow (0 to 7) | 0 to 7 |
| `minutesSinceLastScan` | Elapsed minutes since the most recent checkpoint scan | 0 to 1440 |
| `dwellRatio` | Ratio of actual dwell time to warning threshold ($\frac{\text{minutes}}{\text{threshold}}$) | 0.0 to 10.0+ |
| `skippedCheckpoints` | Count of skipped mandatory checkpoints | 0 to 5 |
| `openAnomalies` | Count of unresolved anomaly alerts on this bag | 0 to 10 |
| `flightDelayed` | Binary indicator if associated flight is delayed | 0 or 1 |
| `flightCancelled` | Binary indicator if associated flight is cancelled | 0 or 1 |
| `minutesToDeparture` | Minutes remaining until scheduled flight departure | -600 to 1440 |
| `notLoadedNearDeparture` | Flag: bag not loaded with <45 min to departure | 0 or 1 |

### Data Leakage Prevention
- Features only use information strictly available at prediction time.
- All train/validation splits are grouped by bag ID so snapshots of the same bag never span both sets.
- Feature scaling parameters ($\mu, \sigma$) are fitted exclusively on the training split.

---

## 3. Installation & Usage

### Prerequisites
- Python 3.10+
- Virtual environment (recommended)

```bash
# Setup virtual environment
python -m venv .venv

# Activate virtual environment
# Windows (PowerShell):
.venv\Scripts\Activate.ps1
# Linux / macOS:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt
```

### Training with Synthetic Data
To test the pipeline and export a model without needing months of historical airport scans:

```bash
python train.py --synthetic --out models/delay_model.json
```

### Training on Exported Database Records
To export historical snapshots from MongoDB:

```bash
npm run export:training -w backend
```

Then train on the exported snapshots:

```bash
python train.py --in ../backend/training_data.jsonl --out models/delay_model.json
```

---

## 4. Backend Integration

Configure `.env` to load the exported model:

```env
DELAY_MODEL_PATH=ml-model/models/delay_model.json
```

When `DELAY_MODEL_PATH` is left unset, AeroTrack Pro automatically falls back to its built-in rules baseline (`baselineRisk` in `shared-utils/src/prediction.js`).
