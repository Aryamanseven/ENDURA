from __future__ import annotations

import json
import logging
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI
from pydantic import BaseModel, Field
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.linear_model import HuberRegressor, LinearRegression

BASE_DIR = Path(__file__).resolve().parent.parent
MODEL_PATH = BASE_DIR / "model.pkl"
MODEL_META_PATH = BASE_DIR / "model_meta.json"
CURRENT_MODEL_VERSION = "v3-clean-physiology"
CV_MIN = 0.0008
CV_MAX = 0.0055

app = FastAPI(title="Vantage ML Service", version="1.0.0")
logger = logging.getLogger("vantage.ml")


class PredictRequest(BaseModel):
    distance_km: float = Field(..., gt=0)
    duration_seconds: float = Field(..., gt=0)
    avg_pace: float = Field(..., gt=0)
    elevation_gain: float = Field(..., ge=0)
    mode: Literal["current", "race_day"] = "current"
    user_id: str | None = None
    user_history: list["RunSample"] = Field(default_factory=list)
    cohort_history: list["RunSample"] = Field(default_factory=list)


class PredictResponse(BaseModel):
    predicted_marathon_time: float
    predicted_times: dict[str, float]
    prediction_std: dict[str, float]
    readiness_adjustment_factor: float
    confidence: float
    model_source: str
    model_version: str


class TrainRequest(BaseModel):
    algorithm: Literal["random_forest", "linear", "gradient_boosting"] = "gradient_boosting"
    runs: list["RunSample"] = Field(default_factory=list)


class TrainResponse(BaseModel):
    status: str
    algorithm: str
    mode: str
    samples: int
    model_version: str


class RunSample(BaseModel):
    distance_km: float = Field(..., gt=0)
    duration_seconds: float = Field(..., gt=0)
    avg_pace: float = Field(..., gt=0)
    elevation_gain: float = Field(..., ge=0)
    date: datetime | None = None
    average_heart_rate: float | None = None
    max_heart_rate: float | None = None
    first_half_pace: float | None = None
    second_half_pace: float | None = None
    first_half_heart_rate: float | None = None
    second_half_heart_rate: float | None = None
    heart_rate_decoupling: float | None = None


PredictRequest.model_rebuild()
TrainRequest.model_rebuild()


def _seconds_to_marathon_from_run(sample: RunSample) -> float:
    base = sample.avg_pace * 42.195 * 60
    grade_penalty = (sample.elevation_gain / max(sample.distance_km, 0.1)) * 18
    return max(3600.0, base + grade_penalty)


def _cv_from_run(sample: RunSample) -> float:
    return float(sample.distance_km / max(sample.duration_seconds, 1e-6))


def _clip_cv(cv: float) -> float:
    return float(np.clip(cv, CV_MIN, CV_MAX))


def _run_regression_weight(run: RunSample) -> float:
    distance_weight = float(np.exp(-max(run.distance_km - 5.0, 0.0) / 28.0))
    pace_penalty = float(np.clip(5.5 / max(run.avg_pace, 3.0), 0.65, 1.2))
    return float(np.clip(distance_weight * pace_penalty, 0.25, 1.5))


def _weighted_r2(y_true: np.ndarray, y_pred: np.ndarray, weights: np.ndarray) -> float | None:
    if y_true.size == 0:
        return None
    w_sum = float(np.sum(weights))
    if w_sum <= 0:
        return None
    mean = float(np.sum(weights * y_true) / w_sum)
    ss_res = float(np.sum(weights * (y_true - y_pred) ** 2))
    ss_tot = float(np.sum(weights * (y_true - mean) ** 2))
    if ss_tot <= 0:
        return None
    return float(1 - (ss_res / ss_tot))


def _build_model(algorithm: str):
    if algorithm == "linear":
        return LinearRegression()
    if algorithm == "random_forest":
        return RandomForestRegressor(n_estimators=260, random_state=42)
    return GradientBoostingRegressor(random_state=42)


def _build_default_model():
    rng = np.random.default_rng(7)
    rows = 300

    distance = rng.uniform(3, 25, rows)
    pace = rng.uniform(4.2, 7.0, rows)
    elevation = rng.uniform(0, 600, rows)
    duration = distance * pace * 60 + rng.normal(0, 120, rows)

    cv_target = distance / np.maximum(duration, 1e-6)

    frame = pd.DataFrame(
        {
            "distance_km": distance,
            "duration_seconds": duration,
            "avg_pace": pace,
            "elevation_gain": elevation,
        }
    )

    model = _build_model("gradient_boosting")
    model.fit(frame, cv_target)
    return model


def _build_model_from_runs(runs: list[RunSample], algorithm: str):
    frame = pd.DataFrame(
        [
            {
                "distance_km": run.distance_km,
                "duration_seconds": run.duration_seconds,
                "avg_pace": run.avg_pace,
                "elevation_gain": run.elevation_gain,
            }
            for run in runs
        ]
    )
    target = np.array([_cv_from_run(run) for run in runs])
    model = _build_model(algorithm)
    model.fit(frame, target)
    return model


def _load_model_meta() -> dict[str, str | int]:
    if MODEL_META_PATH.exists():
        try:
            return json.loads(MODEL_META_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    meta: dict[str, str | int] = {"logic_version": CURRENT_MODEL_VERSION, "train_revision": 0}
    MODEL_META_PATH.write_text(json.dumps(meta), encoding="utf-8")
    return meta


def _save_model_meta(meta: dict[str, str | int]) -> None:
    MODEL_META_PATH.write_text(json.dumps(meta), encoding="utf-8")


def _compose_model_version(meta: dict[str, str | int]) -> str:
    logic_version = str(meta.get("logic_version", CURRENT_MODEL_VERSION))
    train_revision = int(meta.get("train_revision", 0) or 0)
    return f"{logic_version}.r{train_revision}"


def _load_or_create_model():
    if MODEL_PATH.exists():
        return joblib.load(MODEL_PATH)

    model = _build_default_model()
    joblib.dump(model, MODEL_PATH)
    return model


model = _load_or_create_model()
model_meta = _load_model_meta()
model_meta["logic_version"] = CURRENT_MODEL_VERSION
_save_model_meta(model_meta)
active_model_version = _compose_model_version(model_meta)


def _weighted_cv_projection(history: list[RunSample]) -> float | None:
    if not history:
        return None

    now = datetime.now(timezone.utc)
    scored: list[tuple[float, float]] = []
    for run in history:
        projection = _cv_from_run(run)
        recency_days = 180
        if run.date is not None:
            run_date = run.date if run.date.tzinfo else run.date.replace(tzinfo=timezone.utc)
            recency_days = max(0, (now - run_date).days)
        recency_weight = float(np.exp(-recency_days / 20))
        scored.append((projection, recency_weight))

    total_weight = sum(weight for _, weight in scored)
    if total_weight <= 0:
        return None
    return float(sum(value * weight for value, weight in scored) / total_weight)


def _coerce_run_datetime(run: RunSample) -> datetime | None:
    if run.date is None:
        return None
    return run.date if run.date.tzinfo else run.date.replace(tzinfo=timezone.utc)


def _latest_history_date(history: list[RunSample]) -> datetime | None:
    dated = [_coerce_run_datetime(run) for run in history]
    dated = [value for value in dated if value is not None]
    if not dated:
        return None
    return max(dated)


def _canonical_race_distances() -> tuple[float, ...]:
    return (5.0, 10.0, 21.0975, 25.0, 42.195)


def _is_recent_race_effort(run: RunSample, now: datetime, recency_days: int = 45) -> bool:
    run_date = _coerce_run_datetime(run)
    if run_date is None:
        return False
    if (now - run_date).days > recency_days:
        return False
    return any(abs(run.distance_km - distance) <= max(0.6, distance * 0.05) for distance in _canonical_race_distances())


def _best_implied_cv(history: list[RunSample], recency_days: int, race_only: bool = False) -> float | None:
    now = datetime.now(timezone.utc)
    cvs: list[float] = []
    for run in history:
        if run.distance_km <= 0 or run.duration_seconds <= 0:
            continue
        run_date = _coerce_run_datetime(run)
        if run_date is None or (now - run_date).days > recency_days:
            continue
        if race_only and not _is_recent_race_effort(run, now, recency_days=recency_days):
            continue
        cvs.append(_cv_from_run(run))
    if not cvs:
        return None
    return _clip_cv(float(max(cvs)))


def compute_structural_cv(user_history: list[RunSample]) -> dict[str, float | None]:
    now = datetime.now(timezone.utc)
    recent: list[RunSample] = []
    for run in user_history:
        if run.distance_km <= 0 or run.duration_seconds <= 0:
            continue
        run_date = _coerce_run_datetime(run)
        if run_date is None:
            continue
        if (now - run_date).days <= 90:
            recent.append(run)

    if not recent:
        return {
            "structural_cv": None,
            "d_prime": None,
            "r2": None,
            "distance_count": 0.0,
            "stable": False,
        }

    by_distance: dict[float, RunSample] = {}
    for run in recent:
        key = round(run.distance_km, 2)
        if key not in by_distance or run.duration_seconds < by_distance[key].duration_seconds:
            by_distance[key] = run

    distinct_count = len(by_distance)
    best_recent_race_cv_60 = _best_implied_cv(recent, recency_days=60, race_only=True)

    if distinct_count < 3:
        if best_recent_race_cv_60 is None:
            return {
                "structural_cv": None,
                "d_prime": None,
                "r2": None,
                "distance_count": float(distinct_count),
                "stable": False,
            }
        return {
            "structural_cv": float(_clip_cv(best_recent_race_cv_60)),
            "d_prime": 0.0,
            "r2": None,
            "distance_count": float(distinct_count),
            "stable": True,
        }

    times = np.array([run.duration_seconds for run in recent], dtype=float)
    distances = np.array([run.distance_km for run in recent], dtype=float)

    def _run_weight(run: RunSample) -> float:
        run_date = _coerce_run_datetime(run)
        age_days = max(0, (now - run_date).days) if run_date is not None else 90
        return float(np.clip(0.5 ** (age_days / 21.0), 0.05, 1.0))

    weights = np.array([_run_weight(run) for run in recent], dtype=float)
    x = times.reshape(-1, 1)

    robust = HuberRegressor()
    robust.fit(x, distances, sample_weight=weights)
    slope = float(robust.coef_[0])
    intercept = float(max(0.0, robust.intercept_))

    if slope <= 0:
        return {
            "structural_cv": None,
            "d_prime": None,
            "r2": None,
            "distance_count": float(distinct_count),
            "stable": False,
        }

    predicted = robust.predict(x)
    r2 = _weighted_r2(distances, predicted, weights)
    structural_cv = _clip_cv(slope)

    if best_recent_race_cv_60 is not None:
        structural_cv = float(min(structural_cv, _clip_cv(best_recent_race_cv_60 * 1.02)))

    return {
        "structural_cv": float(structural_cv),
        "d_prime": float(intercept),
        "r2": r2,
        "distance_count": float(distinct_count),
        "stable": True,
    }


def simulate_race_day_taper(tsb_info: dict[str, float]) -> dict[str, float]:
    atl = float(tsb_info.get("atl", 0.0))
    ctl = float(tsb_info.get("ctl", 0.0))

    reduction = 0.4
    if atl > max(ctl, 1.0):
        reduction = 0.5
    elif atl < max(0.5 * ctl, 1.0):
        reduction = 0.3

    tapered_atl = float(max(0.0, atl * (1 - reduction)))
    simulated_tsb = float(np.clip(ctl - tapered_atl, 5.0, 15.0))
    race_day_modifier = float(np.clip(1.01 + ((simulated_tsb - 5.0) / 10.0) * 0.03, 1.01, 1.04))

    return {
        "atl": tapered_atl,
        "ctl": ctl,
        "tsb": simulated_tsb,
        "race_day_modifier": race_day_modifier,
    }


def compute_cv_parameters(user_history: list[RunSample]) -> dict[str, float | int | str | bool | None]:
    valid = [run for run in user_history if run.distance_km > 0 and run.duration_seconds > 0]
    if not valid:
        return {
            "cv": None,
            "d_prime": None,
            "method": "riegel-fallback",
            "distance_count": 0,
            "r2": None,
            "stable": False,
        }

    by_distance: dict[float, RunSample] = {}
    for run in valid:
        key = round(run.distance_km, 2)
        if key not in by_distance or run.duration_seconds < by_distance[key].duration_seconds:
            by_distance[key] = run

    distinct = sorted(by_distance.values(), key=lambda item: item.distance_km)
    distance_count = len(distinct)

    if distance_count < 2:
        return {
            "cv": None,
            "d_prime": None,
            "method": "riegel-fallback",
            "distance_count": distance_count,
            "r2": None,
            "stable": False,
        }

    if distance_count == 2:
        p1, p2 = distinct[0], distinct[1]
        dt = p2.duration_seconds - p1.duration_seconds
        if abs(dt) < 1e-6:
            return {
                "cv": None,
                "d_prime": None,
                "method": "riegel-fallback",
                "distance_count": distance_count,
                "r2": None,
                "stable": False,
            }
        cv = (p2.distance_km - p1.distance_km) / dt
        d_prime = max(0.0, p1.distance_km - cv * p1.duration_seconds)
        if cv <= 0:
            return {
                "cv": None,
                "d_prime": None,
                "method": "riegel-fallback",
                "distance_count": distance_count,
                "r2": None,
                "stable": False,
            }
        return {
            "cv": _clip_cv(float(cv)),
            "d_prime": float(d_prime),
            "method": "two-point-cv",
            "distance_count": distance_count,
            "r2": None,
            "stable": True,
        }

    runs_sorted = sorted(
        valid,
        key=lambda r: r.date or datetime.min.replace(tzinfo=timezone.utc),
    )
    runs_for_fit = runs_sorted[-120:]
    times = np.array([run.duration_seconds for run in runs_for_fit], dtype=float)
    distances = np.array([run.distance_km for run in runs_for_fit], dtype=float)
    weights = np.array([_run_regression_weight(run) for run in runs_for_fit], dtype=float)
    x = times.reshape(-1, 1)

    model = HuberRegressor()
    model.fit(x, distances, sample_weight=weights)
    initial_pred = model.predict(x)
    residuals = distances - initial_pred
    residual_std = float(np.std(residuals))
    if residual_std > 0:
        mask = np.abs(residuals) <= (2.5 * residual_std)
    else:
        mask = np.ones_like(residuals, dtype=bool)

    if int(np.sum(mask)) >= 3:
        x_fit = x[mask]
        y_fit = distances[mask]
        w_fit = weights[mask]
    else:
        x_fit = x
        y_fit = distances
        w_fit = weights

    robust = HuberRegressor()
    robust.fit(x_fit, y_fit, sample_weight=w_fit)
    slope = float(robust.coef_[0])
    intercept = float(robust.intercept_)

    if slope <= 0:
        return {
            "cv": None,
            "d_prime": None,
            "method": "riegel-fallback",
            "distance_count": distance_count,
            "r2": None,
            "stable": False,
        }

    predicted = robust.predict(x_fit)
    r2 = _weighted_r2(y_fit, predicted, w_fit)

    return {
        "cv": _clip_cv(float(slope)),
        "d_prime": float(max(0.0, intercept)),
        "method": "robust-weighted-cv",
        "distance_count": distance_count,
        "r2": r2,
        "stable": bool(np.isfinite(slope) and (r2 is None or (np.isfinite(r2) and r2 >= 0))),
    }


def compute_critical_velocity(user_history: list[RunSample]) -> dict[str, float | int | str | bool | None]:
    return compute_cv_parameters(user_history)


def compute_personalized_exponent(user_history: list[RunSample]) -> dict[str, float | int | None]:
    valid = [run for run in user_history if run.distance_km > 0 and run.duration_seconds > 0]
    if not valid:
        return {"exponent": None, "r2": None, "distance_count": 0}

    by_distance: dict[float, RunSample] = {}
    for run in valid:
        key = round(run.distance_km, 2)
        if key not in by_distance or run.duration_seconds < by_distance[key].duration_seconds:
            by_distance[key] = run

    distinct = sorted(by_distance.values(), key=lambda item: item.distance_km)
    if len(distinct) < 2:
        return {"exponent": None, "r2": None, "distance_count": len(distinct)}

    distances = np.array([run.distance_km for run in distinct], dtype=float)
    times = np.array([run.duration_seconds for run in distinct], dtype=float)

    x = np.log(distances)
    y = np.log(times)
    slope, intercept = np.polyfit(x, y, 1)
    predicted = slope * x + intercept
    ss_res = float(np.sum((y - predicted) ** 2))
    ss_tot = float(np.sum((y - np.mean(y)) ** 2))
    r2 = None if ss_tot <= 0 else float(1 - (ss_res / ss_tot))

    if not np.isfinite(slope):
        return {"exponent": None, "r2": r2, "distance_count": len(distinct)}

    return {
        "exponent": float(max(1.0, slope)),
        "r2": r2,
        "distance_count": len(distinct),
    }


def sanitize_structural_cv(cv: float | None) -> float | None:
    if cv is None or cv <= 0:
        return None
    return _clip_cv(cv)


def apply_readiness_modifier(cv: float | None, tsb_info: dict[str, float]) -> float | None:
    if cv is None or cv <= 0:
        return None
    readiness_factor = tsb_info.get("readiness_modifier", 1.0)
    return _clip_cv(float(cv * max(readiness_factor, 1e-6)))


def project_time_with_cv(target_distance_km: float, cv: float | None, d_prime: float | None) -> float | None:
    if cv is None or cv <= 0:
        return None
    d_prime_value = max(0.0, float(d_prime or 0.0))
    if d_prime_value <= 0 or target_distance_km >= 21.0975 or target_distance_km > (4 * d_prime_value):
        return float(max(300.0, target_distance_km / cv))
    adjusted_distance = max(target_distance_km - d_prime_value, 1e-6)
    return float(max(300.0, adjusted_distance / cv))


def _adjust_cv_for_profile(cv: float, d_prime: float, user_history: list[RunSample]) -> tuple[float, float, float | None, float | None]:
    short_runs = [run for run in user_history if run.distance_km <= 5 and run.duration_seconds > 0]
    long_runs = [run for run in user_history if run.distance_km >= 10 and run.duration_seconds > 0]

    if not short_runs or not long_runs:
        return cv, d_prime, None, None

    speed_index = max(run.distance_km / run.duration_seconds for run in short_runs)
    endurance_index = max(run.distance_km / run.duration_seconds for run in long_runs)
    if endurance_index <= 0:
        return cv, d_prime, speed_index, endurance_index

    profile_gap = max(0.0, (speed_index / endurance_index) - 1.0)

    residuals: list[float] = []
    for run in long_runs:
        projected = project_time_with_cv(run.distance_km, cv, d_prime)
        if projected and projected > 0:
            residuals.append(run.duration_seconds / projected)

    if not residuals:
        return cv, d_prime, speed_index, endurance_index

    endurance_gap = max(0.0, float(np.mean(residuals)) - 1.0)
    attenuation = 1 / (1 + profile_gap * endurance_gap)

    adjusted_cv = float(cv * attenuation)
    adjusted_d_prime = float(max(0.0, d_prime * attenuation))
    return adjusted_cv, adjusted_d_prime, speed_index, endurance_index


def generate_curve_from_cv(cv: float, d_prime: float | None) -> dict[str, float]:
    targets = {
        "five_k": 5.0,
        "ten_k": 10.0,
        "half_marathon": 21.0975,
        "twenty_five_k": 25.0,
        "marathon": 42.195,
    }
    projected: dict[str, float] = {}
    for key, distance in targets.items():
        time_value = project_time_with_cv(distance, cv, d_prime)
        projected[key] = round(float(time_value if time_value is not None else 300.0), 2)
    return projected


def _pace_monotonic(predicted_times: dict[str, float]) -> bool:
    sequence = [
        ("five_k", 5.0),
        ("ten_k", 10.0),
        ("half_marathon", 21.0975),
        ("marathon", 42.195),
    ]
    paces = [float(predicted_times[key]) / distance for key, distance in sequence]
    return all(paces[i] <= paces[i + 1] + 1e-9 for i in range(len(paces) - 1))


def _enforce_monotonic_curve(cv: float, d_prime: float | None, max_iterations: int = 10) -> tuple[dict[str, float], float]:
    working_cv = _clip_cv(cv)
    curve = generate_curve_from_cv(working_cv, d_prime)
    return _enforce_pace_monotonicity(curve), working_cv


def _enforce_pace_monotonicity(predicted_times: dict[str, float]) -> dict[str, float]:
    corrected = dict(predicted_times)
    ordered = [
        ("five_k", 5.0),
        ("ten_k", 10.0),
        ("half_marathon", 21.0975),
        ("twenty_five_k", 25.0),
        ("marathon", 42.195),
    ]
    last_pace = None
    for key, distance in ordered:
        pace = float(corrected[key]) / distance
        if last_pace is not None and pace < last_pace:
            min_time = last_pace * distance
            corrected[key] = round(float(min_time), 2)
            pace = float(corrected[key]) / distance
            if pace < last_pace:
                corrected[key] = round(float(min_time + 0.01), 2)
                pace = float(corrected[key]) / distance
        last_pace = pace
    return corrected


def _has_strong_recent_cv_support(user_history: list[RunSample], candidate_cv: float, recency_days: int = 45) -> bool:
    now = datetime.now(timezone.utc)
    for run in user_history:
        if run.date is None:
            continue
        run_date = run.date if run.date.tzinfo else run.date.replace(tzinfo=timezone.utc)
        if (now - run_date).days > recency_days:
            continue
        projected_time = run.distance_km / max(candidate_cv, 1e-6)
        if run.duration_seconds <= projected_time * 1.01:
            return True
    return False


def _recent_best_implied_cv(user_history: list[RunSample], recency_days: int = 120) -> float | None:
    now = datetime.now(timezone.utc)
    values: list[float] = []
    for run in user_history:
        if run.date is None:
            continue
        run_date = run.date if run.date.tzinfo else run.date.replace(tzinfo=timezone.utc)
        if (now - run_date).days > recency_days:
            continue
        values.append(_cv_from_run(run))
    if not values:
        return None
    return _clip_cv(float(max(values)))


def compute_prediction_std(
    user_history: list[RunSample],
    cohort_history: list[RunSample],
    cv_profile: dict[str, float | int | str | bool | None],
    predicted_times: dict[str, float],
) -> dict[str, float]:
    paces = np.array([run.avg_pace for run in user_history], dtype=float) if user_history else np.array([])
    pace_variability = float(np.std(paces) / np.mean(paces)) if paces.size >= 2 and np.mean(paces) > 0 else 0.18

    r2 = cv_profile.get("r2")
    regression_uncertainty = 0.2
    if isinstance(r2, float) and np.isfinite(r2):
        regression_uncertainty = float(np.clip(1 - max(0.0, r2), 0.05, 0.5))

    cohort_cvs = np.array([_cv_from_run(run) for run in cohort_history], dtype=float) if cohort_history else np.array([])
    cohort_dispersion = float(np.std(cohort_cvs) / np.mean(cohort_cvs)) if cohort_cvs.size >= 2 and np.mean(cohort_cvs) > 0 else 0.12

    sparse_penalty = 1 / np.sqrt(max(1, len(user_history)))
    relative_std = float(np.clip(0.22 * regression_uncertainty + 0.36 * pace_variability + 0.22 * cohort_dispersion + 0.2 * sparse_penalty, 0.03, 0.30))

    return {
        key: round(float(np.clip(value * relative_std, value * 0.03, value * 0.30)), 2)
        for key, value in predicted_times.items()
    }


def evaluate_prediction_accuracy(runs: list[RunSample]) -> dict[str, dict[str, float]]:
    targets = {
        "five_k": 5.0,
        "ten_k": 10.0,
        "half_marathon": 21.0975,
        "twenty_five_k": 25.0,
        "marathon": 42.195,
    }

    errors: dict[str, list[float]] = {key: [] for key in targets}
    percentage_errors: dict[str, list[float]] = {key: [] for key in targets}

    for run in runs:
        prediction_payload = getattr(run, "prediction", None)
        if prediction_payload is None and isinstance(run, dict):
            prediction_payload = run.get("prediction")
        if not isinstance(prediction_payload, dict):
            continue

        predicted_times = prediction_payload.get("predicted_times")
        if not isinstance(predicted_times, dict):
            continue

        for key, distance in targets.items():
            if abs(run.distance_km - distance) > max(1.0, distance * 0.1):
                continue
            predicted = predicted_times.get(key)
            if predicted is None:
                continue
            actual = float(run.duration_seconds)
            err = abs(float(predicted) - actual)
            errors[key].append(err)
            if actual > 0:
                percentage_errors[key].append((err / actual) * 100)

    return {
        key: {
            "mae": round(float(np.mean(errors[key])), 3) if errors[key] else 0.0,
            "mape": round(float(np.mean(percentage_errors[key])), 3) if percentage_errors[key] else 0.0,
            "samples": float(len(errors[key])),
        }
        for key in targets
    }


def project_all_distances(
    current: PredictRequest,
    effective_cv: float | None,
    d_prime: float | None,
    personalized_exponent: float | None,
) -> tuple[dict[str, float], str, float]:
    targets = {
        "five_k": 5.0,
        "ten_k": 10.0,
        "half_marathon": 21.0975,
        "twenty_five_k": 25.0,
        "marathon": 42.195,
    }

    if effective_cv is not None and effective_cv > 0:
        return generate_curve_from_cv(effective_cv, d_prime), "cv", 0.0

    exponent = personalized_exponent if personalized_exponent is not None else 1.06
    projected = {
        key: round(
            float(
                max(
                    300.0,
                    _riegel_project(current.duration_seconds, current.distance_km, distance, exponent=exponent),
                )
            ),
            2,
        )
        for key, distance in targets.items()
    }
    curve_model = "personalized-riegel" if personalized_exponent is not None else "default-riegel"
    return projected, curve_model, exponent


def _top_similar_cv(current: PredictRequest, cohort: list[RunSample], k: int = 14) -> float | None:
    if not cohort:
        return None

    target = np.array([
        current.distance_km,
        current.duration_seconds,
        current.avg_pace,
        current.elevation_gain,
    ])
    scales = np.array([12.0, 4800.0, 1.6, 260.0])

    candidates: list[tuple[float, float]] = []
    for run in cohort:
        vector = np.array([
            run.distance_km,
            run.duration_seconds,
            run.avg_pace,
            run.elevation_gain,
        ])
        distance = float(np.linalg.norm((target - vector) / scales))
        similarity = 1 / (1 + distance)
        candidates.append((similarity, _cv_from_run(run)))

    top = sorted(candidates, key=lambda item: item[0], reverse=True)[:k]
    total = sum(weight for weight, _ in top)
    if total <= 0:
        return None
    return float(sum(weight * value for weight, value in top) / total)


def _compute_run_training_load(run: RunSample) -> float:
    duration_minutes = run.duration_seconds / 60
    if run.average_heart_rate and run.max_heart_rate and run.max_heart_rate > 0:
        relative_intensity = float(np.clip(run.average_heart_rate / run.max_heart_rate, 0.45, 1.2))
        return float(duration_minutes * (relative_intensity**2))

    grade = run.elevation_gain / max(run.distance_km, 0.1)
    fallback_intensity = float(np.clip(1 + grade / 800, 0.85, 1.3))
    return float(duration_minutes * fallback_intensity)


def compute_tsb(user_history: list[RunSample]) -> dict[str, float]:
    dated_runs = [run for run in user_history if run.date is not None]
    if not dated_runs:
        return {"atl": 0.0, "ctl": 0.0, "tsb": 0.0, "readiness_modifier": 1.0}

    daily_load: dict[datetime.date, float] = {}
    for run in dated_runs:
        run_date = run.date if run.date.tzinfo else run.date.replace(tzinfo=timezone.utc)
        day = run_date.date()
        daily_load[day] = daily_load.get(day, 0.0) + _compute_run_training_load(run)

    first_day = min(daily_load)
    last_day = max(daily_load)
    day_count = (last_day - first_day).days + 1
    atl = 0.0
    ctl = 0.0
    atl_decay = float(np.exp(-1 / 7))
    ctl_decay = float(np.exp(-1 / 42))

    for offset in range(day_count):
        day = first_day + timedelta(days=offset)
        load_today = daily_load.get(day, 0.0)
        atl = atl * atl_decay + load_today * (1 - atl_decay)
        ctl = ctl * ctl_decay + load_today * (1 - ctl_decay)

    tsb = ctl - atl
    readiness_modifier = 1.0
    if tsb < -15:
        readiness_modifier = float(np.clip(1 - (abs(tsb) - 15) * 0.004, 0.95, 1.0))
    elif tsb > 5:
        readiness_modifier = float(np.clip(1 + (tsb - 5) * 0.002, 1.0, 1.04))

    readiness_modifier = float(np.clip(readiness_modifier, 0.97, 1.03))

    return {
        "atl": float(atl),
        "ctl": float(ctl),
        "tsb": float(tsb),
        "readiness_modifier": readiness_modifier,
    }


def compute_endurance_modifier(run: RunSample, target_distance_km: float) -> float:
    if target_distance_km <= 21:
        return 1.0

    decoupling: float | None = None
    if run.heart_rate_decoupling is not None:
        decoupling = run.heart_rate_decoupling
    elif (
        run.first_half_pace is not None
        and run.second_half_pace is not None
        and run.first_half_heart_rate is not None
        and run.second_half_heart_rate is not None
        and run.first_half_heart_rate > 0
        and run.second_half_heart_rate > 0
    ):
        speed1 = 1000 / max(run.first_half_pace * 60, 1)
        speed2 = 1000 / max(run.second_half_pace * 60, 1)
        eff1 = speed1 / run.first_half_heart_rate
        eff2 = speed2 / run.second_half_heart_rate
        if eff1 > 0:
            decoupling = (eff1 - eff2) / eff1

    if decoupling is not None and decoupling > 0.05:
        penalty = float(np.exp(-(decoupling - 0.05) * 6.0))
        return float(np.clip(penalty, 0.78, 1.0))

    if run.first_half_pace is not None and run.second_half_pace is not None and run.first_half_pace > 0:
        fade = (run.second_half_pace - run.first_half_pace) / run.first_half_pace
        if fade > 0.04:
            penalty = float(np.exp(-(fade - 0.04) * 8.0))
            return float(np.clip(penalty, 0.8, 1.0))

    return 1.0


def _riegel_project(base_time_seconds: float, base_distance_km: float, target_distance_km: float, exponent: float = 1.06) -> float:
    return float(base_time_seconds * ((target_distance_km / max(base_distance_km, 0.1)) ** exponent))


def _recent_distance_pb(history: list[RunSample], target_distance_km: float, recency_days: int = 365, tolerance: float = 1.0) -> float | None:
    now = datetime.now(timezone.utc)
    candidates: list[RunSample] = []
    for run in history:
        if abs(run.distance_km - target_distance_km) > tolerance or run.date is None:
            continue
        run_date = run.date if run.date.tzinfo else run.date.replace(tzinfo=timezone.utc)
        if (now - run_date).days <= recency_days:
            candidates.append(run)
    if not candidates:
        return None
    return float(min(run.duration_seconds for run in candidates))


def compute_confidence(
    user_history: list[RunSample],
    cv_profile: dict[str, float | int | str | bool | None],
) -> float:
    richness = min(0.45, len(user_history) * 0.03)
    distance_richness = min(0.2, float(cv_profile.get("distance_count", 0) or 0) * 0.05)
    r2 = cv_profile.get("r2")
    r2_term = 0.0
    if isinstance(r2, float) and np.isfinite(r2):
        r2_term = min(0.2, max(0.0, r2) * 0.2)
    confidence = 0.3 + richness + distance_richness + r2_term
    if not bool(cv_profile.get("stable", False)):
        confidence -= 0.08
    return float(np.clip(confidence, 0.3, 0.95))


def _project_curve_from_cv(cv: float, d_prime: float) -> dict[str, float]:
    safe_cv = _clip_cv(cv)

    def _short_time(distance_km: float) -> float:
        if d_prime > 0:
            return float(max(300.0, (max(distance_km - d_prime, 1e-6)) / safe_cv))
        return float(max(300.0, distance_km / safe_cv))

    five_k = _short_time(5.0)
    ten_k = _short_time(10.0)
    half = _riegel_project(ten_k, 10.0, 21.0975, exponent=1.06)
    twenty_five = _riegel_project(ten_k, 10.0, 25.0, exponent=1.06)
    marathon = _riegel_project(ten_k, 10.0, 42.195, exponent=1.06)

    return {
        "five_k": round(float(five_k), 2),
        "ten_k": round(float(ten_k), 2),
        "half_marathon": round(float(half), 2),
        "twenty_five_k": round(float(twenty_five), 2),
        "marathon": round(float(marathon), 2),
    }


def _enforce_guarantees(predicted_times: dict[str, float]) -> dict[str, float]:
    corrected = dict(predicted_times)
    corrected["ten_k"] = round(float(max(corrected["ten_k"], corrected["five_k"] * 1.95)), 2)
    corrected["half_marathon"] = round(float(max(corrected["half_marathon"], corrected["ten_k"] * 2.0)), 2)
    corrected["marathon"] = round(float(max(corrected["marathon"], corrected["half_marathon"] * 2.02)), 2)
    return _enforce_pace_monotonicity(corrected)


def _recent_race_support_for_prediction(
    user_history: list[RunSample],
    distance_km: float,
    predicted_time: float,
    recency_days: int = 60,
) -> bool:
    now = datetime.now(timezone.utc)
    candidate_cv = distance_km / max(predicted_time, 1e-6)
    for run in user_history:
        run_date = _coerce_run_datetime(run)
        if run_date is None or (now - run_date).days > recency_days:
            continue
        if not _is_recent_race_effort(run, now, recency_days=recency_days):
            continue
        if _cv_from_run(run) >= candidate_cv * 0.99:
            return True
    return False


def _apply_recent_pb_floor(
    predicted_times: dict[str, float],
    user_history: list[RunSample],
    allow_breakthrough: bool,
) -> dict[str, float]:
    distances = {
        "five_k": 5.0,
        "ten_k": 10.0,
        "half_marathon": 21.0975,
        "twenty_five_k": 25.0,
        "marathon": 42.195,
    }
    adjusted = dict(predicted_times)
    for key, distance in distances.items():
        pb = _recent_distance_pb(user_history, target_distance_km=distance)
        if pb is None:
            continue
        floor_time = float(0.98 * pb)
        if adjusted[key] < floor_time and not (
            allow_breakthrough or _recent_race_support_for_prediction(user_history, distance, adjusted[key])
        ):
            adjusted[key] = round(floor_time, 2)
    return adjusted


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "vantage-ml"}


@app.post("/predict", response_model=PredictResponse)
def predict(payload: PredictRequest) -> PredictResponse:
    structural_profile = compute_structural_cv(payload.user_history)
    structural_cv = structural_profile.get("structural_cv")
    effective_structural_cv = float(structural_cv) if isinstance(structural_cv, float) else None
    d_prime = float(structural_profile.get("d_prime") or 0.0)

    if effective_structural_cv is not None:
        best_recent_race_cv_60 = _best_implied_cv(payload.user_history, recency_days=60, race_only=True)
        if best_recent_race_cv_60 is not None:
            effective_structural_cv = float(min(_clip_cv(effective_structural_cv), _clip_cv(best_recent_race_cv_60 * 1.02)))

    cv_profile = {
        "cv": effective_structural_cv,
        "d_prime": d_prime,
        "r2": structural_profile.get("r2"),
        "distance_count": int(structural_profile.get("distance_count", 0) or 0),
        "stable": bool(structural_profile.get("stable", False)),
        "method": "structural-cv",
    }
    tsb_info = compute_tsb(payload.user_history)
    current_factor = float(np.clip(tsb_info.get("readiness_modifier", 1.0), 0.97, 1.03))

    if effective_structural_cv is None:
        latest_run = None
        sorted_history = sorted(
            payload.user_history,
            key=lambda run: _coerce_run_datetime(run) or datetime.min.replace(tzinfo=timezone.utc),
            reverse=True,
        )
        for run in sorted_history:
            if run.distance_km > 0 and run.duration_seconds > 0:
                latest_run = run
                break

        base_time = payload.duration_seconds
        base_distance = payload.distance_km
        if latest_run is not None:
            base_time = latest_run.duration_seconds
            base_distance = latest_run.distance_km

        predicted_times = {
            "five_k": round(float(max(300.0, _riegel_project(base_time, base_distance, 5.0, exponent=1.06))), 2),
            "ten_k": round(float(max(300.0, _riegel_project(base_time, base_distance, 10.0, exponent=1.06))), 2),
            "half_marathon": round(float(max(300.0, _riegel_project(base_time, base_distance, 21.0975, exponent=1.06))), 2),
            "twenty_five_k": round(float(max(300.0, _riegel_project(base_time, base_distance, 25.0, exponent=1.06))), 2),
            "marathon": round(float(max(300.0, _riegel_project(base_time, base_distance, 42.195, exponent=1.06))), 2),
        }
        mode_adjustment_factor = 1.0
        model_source = "riegel-fallback"
    else:
        current_cv = _clip_cv(effective_structural_cv * current_factor)
        mode_adjustment_factor = current_factor
        selected_cv = current_cv

        if payload.mode == "race_day":
            taper_factor = float(np.clip(simulate_race_day_taper(tsb_info)["race_day_modifier"], 1.0, 1.03))
            race_day_cv = _clip_cv(effective_structural_cv * taper_factor)
            selected_cv = float(min(race_day_cv, current_cv * 1.03))
            mode_adjustment_factor = float(selected_cv / max(effective_structural_cv, 1e-6))

        predicted_times = _project_curve_from_cv(selected_cv, d_prime)
        model_source = f"structural-{payload.mode}"

    predicted_times = _enforce_guarantees(predicted_times)
    allow_breakthrough = payload.mode == "race_day" and float(tsb_info.get("tsb", 0.0)) > 0
    predicted_times = _apply_recent_pb_floor(predicted_times, payload.user_history, allow_breakthrough)
    predicted_times = _enforce_guarantees(predicted_times)

    if payload.mode == "race_day" and effective_structural_cv is not None:
        current_times = _enforce_guarantees(_project_curve_from_cv(_clip_cv(effective_structural_cv * current_factor), d_prime))
        for key, value in predicted_times.items():
            predicted_times[key] = round(float(max(value, current_times[key] * 0.97)), 2)

    adjusted_prediction = float(predicted_times["marathon"])
    prediction_std = compute_prediction_std(
        user_history=payload.user_history,
        cohort_history=payload.cohort_history,
        cv_profile=cv_profile,
        predicted_times=predicted_times,
    )

    confidence = compute_confidence(
        user_history=payload.user_history,
        cv_profile=cv_profile,
    )

    response = PredictResponse(
        predicted_marathon_time=round(adjusted_prediction, 2),
        predicted_times=predicted_times,
        prediction_std=prediction_std,
        readiness_adjustment_factor=round(float(mode_adjustment_factor), 3),
        confidence=round(confidence, 3),
        model_source=model_source,
        model_version=CURRENT_MODEL_VERSION,
    )

    return response


@app.post("/train", response_model=TrainResponse)
def train(payload: TrainRequest) -> TrainResponse:
    global model
    global model_meta
    global active_model_version

    if len(payload.runs) >= 10:
        model = _build_model_from_runs(payload.runs, payload.algorithm)
        mode = "real-runs"
    else:
        model = _build_default_model()
        mode = "synthetic-bootstrap"

    joblib.dump(model, MODEL_PATH)

    model_meta["logic_version"] = CURRENT_MODEL_VERSION
    model_meta["train_revision"] = int(model_meta.get("train_revision", 0) or 0) + 1
    _save_model_meta(model_meta)
    active_model_version = _compose_model_version(model_meta)

    return TrainResponse(
        status="retrained",
        algorithm=payload.algorithm,
        mode=mode,
        samples=len(payload.runs),
        model_version=active_model_version,
    )
