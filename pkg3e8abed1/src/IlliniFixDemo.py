import hashlib
import math

# ---------------------------------------------------------------------------------------
# Deterministic telemetry generator — byte-identical with resource/generate_demo_data.py
# ---------------------------------------------------------------------------------------
HOURS = 168
CHUNK = 1000
DEMO_ASSETS = ["ast_grainger_elev2", "ast_cif_hvac7"]
DEMO_REPORT_TEXT = "The elevator in Grainger was shaking and making a grinding noise."

DEGRADATION_PROFILES = {
    "ast_grainger_elev2": {
        "MotorCurrent": {"driftPct": 0.19, "startHoursBeforeEnd": 72, "shape": 1.4, "noiseMult": 1.3},
        "Vibration": {"driftPct": 0.31, "startHoursBeforeEnd": 72, "shape": 1.3, "noiseMult": 2.0},
        "MotorTemperature": {"driftPct": 0.12, "startHoursBeforeEnd": 72, "shape": 1.6, "noiseMult": 1.0},
        "DoorCycleTime": {"driftPct": 0.08, "startHoursBeforeEnd": 48, "shape": 1.0, "noiseMult": 1.2},
    },
    "ast_cif_hvac7": {
        "SupplyTemperature": {"driftPct": 0.10, "startHoursBeforeEnd": 48, "shape": 1.3, "noiseMult": 1.2},
        "FanCurrent": {"driftPct": 0.10, "startHoursBeforeEnd": 60, "shape": 1.2, "noiseMult": 1.3},
        "Airflow": {"driftPct": -0.09, "startHoursBeforeEnd": 60, "shape": 1.2, "noiseMult": 1.0},
        "ReturnTemperature": {"driftPct": 0.03, "startHoursBeforeEnd": 48, "shape": 1.0, "noiseMult": 1.0},
    },
    "ast_arc_pump3": {
        "Vibration": {"driftPct": 0.30, "startHoursBeforeEnd": 120, "shape": 1.1, "noiseMult": 1.6},
        "MotorCurrent": {"driftPct": 0.11, "startHoursBeforeEnd": 120, "shape": 1.0, "noiseMult": 1.1},
        "FlowRate": {"driftPct": -0.12, "startHoursBeforeEnd": 120, "shape": 1.0, "noiseMult": 1.0},
        "Pressure": {"driftPct": -0.05, "startHoursBeforeEnd": 96, "shape": 1.0, "noiseMult": 1.0},
    },
    "ast_isr_boiler2": {
        "Pressure": {"driftPct": 0.0, "startHoursBeforeEnd": 48, "shape": 1.0, "noiseMult": 2.6},
        "WaterTemperature": {"driftPct": -0.045, "startHoursBeforeEnd": 48, "shape": 1.0, "noiseMult": 1.3},
    },
    "ast_eceb_panel4": {
        "PanelTemperature": {"driftPct": 0.075, "startHoursBeforeEnd": 24, "shape": 0.6, "noiseMult": 1.0},
        "LoadCurrent": {"driftPct": 0.03, "startHoursBeforeEnd": 24, "shape": 0.6, "noiseMult": 1.0},
    },
    "ast_isr_elev1": {
        "DoorCycleTime": {"driftPct": 0.10, "startHoursBeforeEnd": 96, "shape": 1.0, "noiseMult": 1.5},
    },
    "ast_siebel_hvac6": {
        "FanCurrent": {"driftPct": 0.14, "startHoursBeforeEnd": 96, "shape": 1.0, "noiseMult": 1.2},
        "Airflow": {"driftPct": -0.08, "startHoursBeforeEnd": 96, "shape": 1.0, "noiseMult": 1.0},
    },
}


def _u(key, salt):
    h = hashlib.sha256("{}|{}".format(key, salt).encode("utf-8")).hexdigest()
    return int(h[:12], 16) / float(16 ** 12)


def _gauss(key, salt):
    u1 = max(_u(key, "{}a".format(salt)), 1e-12)
    u2 = _u(key, "{}b".format(salt))
    return math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)


def _reading_value(sensor_id, mean, sd, diurnal_amp, idx, hour_of_day, profile=None, total=HOURS):
    diurnal = diurnal_amp * sd * math.sin(2.0 * math.pi * (hour_of_day - 6) / 24.0)
    value = mean + diurnal + sd * _gauss(sensor_id, str(idx))
    if profile:
        start = profile.get("startHoursBeforeEnd", 72)
        hours_from_end = (total - 1) - idx
        if hours_from_end < start:
            progress = (start - hours_from_end) / float(start)
            progress = min(1.0, max(0.0, progress)) ** profile.get("shape", 1.0)
            value += mean * profile.get("driftPct", 0.0) * progress
            extra = profile.get("noiseMult", 1.0) - 1.0
            if extra > 0:
                value += sd * extra * progress * _gauss(sensor_id, "n{}".format(idx))
    return value


def _series_end():
    now = c3.DateTime.now()
    return c3.DateTime.fromMillis((int(now.millis) // 3600000) * 3600000)


def _regenerate_asset(asset_id, profiles):
    """Rewrites the 168 hourly readings of every sensor on the asset (ids are deterministic,
    so mergeBatch overwrites in place — no growth, no deletes)."""
    sensors = list(c3.Sensor.fetch(filter=c3.Filter.eq("asset.id", asset_id), include="this", limit=-1).objs or [])
    end = _series_end()
    start = end.minusHours(HOURS - 1)
    rows = []
    written = 0
    for s in sensors:
        profile = (profiles or {}).get(s.sensorType)
        mean = float(s.baselineMean)
        sd = float(s.baselineStdDev) if s.baselineStdDev else 1.0
        amp = float(s.diurnalAmplitude or 0.0)
        for idx in range(HOURS):
            t = start.plusHours(idx)
            v = _reading_value(s.id, mean, sd, amp, idx, int(t.hourOfDay), profile)
            z = abs(v - mean) / sd
            rows.append(c3.SensorReading.make({
                "id": "sr_{}_{:03d}".format(s.id[4:], idx),
                "sensor": {"id": s.id},
                "timestamp": t,
                "value": round(v, 4),
                "anomalyScore": round(z, 3),
                "isAnomaly": bool(z > 2.5),
            }))
            if len(rows) >= CHUNK:
                c3.SensorReading.mergeBatch(rows)
                written += len(rows)
                rows = []
    if rows:
        c3.SensorReading.mergeBatch(rows)
        written += len(rows)
    return {"assetId": asset_id, "sensors": len(sensors), "readingsWritten": written, "telemetryEndsAt": str(end)}


def _current_probability(asset_id):
    preds = list(c3.FailurePrediction.fetch(
        filter=c3.Filter.eq("asset.id", asset_id).and_(c3.Filter.eq("isCurrent", True)),
        include="failureProbability, riskLevel, predictedFailureMode", limit=1).objs or [])
    if not preds:
        return None
    p = preds[0]
    return {"failureProbability": p.failureProbability, "riskLevel": p.riskLevel, "predictedFailureMode": p.predictedFailureMode}


def seedTelemetry(cls):
    assets = list(c3.MaintenanceAsset.fetch(include="id", limit=-1).objs or [])
    written = 0
    end = None
    for a in assets:
        res = _regenerate_asset(a.id, DEGRADATION_PROFILES.get(a.id, {}))
        written += res["readingsWritten"]
        end = res["telemetryEndsAt"]
    summary = c3.IlliniFixRiskEngine.recomputeAll()
    return {"assets": len(assets), "readingsWritten": written, "telemetryEndsAt": end, "risk": summary}


def _inject(asset_id, message):
    res = _regenerate_asset(asset_id, DEGRADATION_PROFILES.get(asset_id, {}))
    prediction = c3.IlliniFixRiskEngine.recomputeAsset(asset_id)
    c3.IlliniFixTriage.triageAll()
    return {"assetId": asset_id, "telemetry": res, "prediction": prediction, "message": message}


def injectElevatorDegradation(cls):
    return _inject("ast_grainger_elev2", "Grainger Elevator #2: motor current, vibration and motor temperature now trend upward over the last 72 hours.")


def injectHvacFailure(cls):
    return _inject("ast_cif_hvac7", "CIF HVAC #7: supply air temperature and fan current rising, airflow declining over the last 48-60 hours.")


def submitDemoReport(cls):
    result = c3.IlliniFixTriage.submitReport(DEMO_REPORT_TEXT, "bld_grainger", "zone_grainger_f2", None, "Student")
    rid = result.get("reportId") if isinstance(result, dict) else None
    if rid:
        c3.StudentReport.make({"id": rid, "isDemoGenerated": True}).merge()
    return result


def _remove_where(type_, filter_str):
    """removeAll requires a RemoveAllSpec and an explicit confirmation flag."""
    return type_.removeAll(c3.RemoveAllSpec.make({"filter": filter_str}), True)


def resetDemo(cls):
    for asset_id in DEMO_ASSETS:
        _regenerate_asset(asset_id, {})
    demo_wos = list(c3.WorkOrder.fetch(filter=c3.Filter.eq("isDemoGenerated", True), include="id", limit=-1).objs or [])
    for wo in demo_wos:
        _remove_where(c3.CrewAssignment, "workOrder.id == '{}'".format(wo.id))
    if demo_wos:
        _remove_where(c3.WorkOrder, "isDemoGenerated == true")
    _remove_where(c3.StudentReport, "isDemoGenerated == true")
    _remove_where(c3.SimulationScenario, "scenarioType == 'AssetFailure' || scenarioType == 'AssetRepair'")
    c3.IlliniFixPlanner.clearPlan()
    c3.IlliniFixRiskEngine.recomputeAll()
    state = getDemoState(cls)
    state["message"] = "Demo reset: clean telemetry restored for the demo assets, demo-generated records removed."
    return state


def getDemoState(cls):
    elev = _current_probability("ast_grainger_elev2")
    hvac = _current_probability("ast_cif_hvac7")
    latest = list(c3.SensorReading.fetch(include="timestamp", order="descending(timestamp)", limit=1).objs or [])
    plans = list(c3.MaintenancePlan.fetch(filter=c3.Filter.eq("isCurrent", True), include="id", limit=1).objs or [])
    return {
        "elevatorDegraded": bool(elev and elev["failureProbability"] is not None and elev["failureProbability"] >= 0.5),
        "hvacDegraded": bool(hvac and hvac["failureProbability"] is not None and hvac["failureProbability"] >= 0.5),
        "elevatorPrediction": elev,
        "hvacPrediction": hvac,
        "demoReports": len(list(c3.StudentReport.fetch(filter=c3.Filter.eq("isDemoGenerated", True), include="id", limit=-1).objs or [])),
        "demoWorkOrders": len(list(c3.WorkOrder.fetch(filter=c3.Filter.eq("isDemoGenerated", True), include="id", limit=-1).objs or [])),
        "scenarios": len(list(c3.SimulationScenario.fetch(include="id", limit=-1).objs or [])),
        "planExists": len(plans) > 0,
        "telemetryEndsAt": str(latest[0].timestamp) if latest else None,
    }
