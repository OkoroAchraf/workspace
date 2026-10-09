import math

MODEL_VERSION = "statistical-zscore-logistic-v1"
HOUR_MS = 3600000.0
DAY_MS = 86400000.0

# Logistic model coefficients (documented in IlliniFixRiskEngine.c3typ)
INTERCEPT = -3.3
W_A, W_T, W_R, W_H, W_O = 3.2, 1.0, 0.7, 0.5, 0.5

CRIT_W = {"Low": 0.25, "Moderate": 0.5, "High": 0.75, "Critical": 1.0}
ACCESS_W = {"None": 0.0, "Low": 0.25, "Moderate": 0.5, "High": 0.75, "Critical": 1.0}
OPS_W = {"Elevator": 0.9, "HVAC": 0.7, "Pump": 0.6, "Boiler": 0.8, "ElectricalPanel": 0.8, "Generator": 0.5,
         "WaterSystem": 0.6, "LightingSystem": 0.4, "DoorAccessSystem": 0.5, "FireSafetyEquipment": 0.9}
CATEGORIES_FOR_TYPE = {"Elevator": ["Elevator"], "HVAC": ["HVAC"], "Pump": ["General", "Plumbing"],
                       "Boiler": ["Plumbing", "HVAC"], "ElectricalPanel": ["Electrical", "Lighting"], "Generator": ["Electrical"]}
SKILL_FOR_TYPE = {"Elevator": "Elevator", "HVAC": "HVAC", "Pump": "Mechanical", "Boiler": "Mechanical",
                  "ElectricalPanel": "Electrical", "Generator": "Electrical"}
SENSOR_LABEL = {"MotorCurrent": "Motor current", "MotorTemperature": "Motor temperature", "Vibration": "Vibration",
                "DoorCycleTime": "Door cycle time", "SupplyTemperature": "Supply air temperature",
                "ReturnTemperature": "Return air temperature", "FanCurrent": "Fan motor current", "Airflow": "Airflow",
                "FlowRate": "Flow rate", "Pressure": "Pressure", "WaterTemperature": "Water temperature",
                "FlueTemperature": "Flue gas temperature", "LoadCurrent": "Load current", "PanelTemperature": "Panel temperature",
                "VoltageImbalance": "Voltage imbalance", "BatteryVoltage": "Battery voltage", "CoolantTemperature": "Coolant temperature"}
REPORT_KEYWORDS = {
    "Elevator": ["shak", "shook", "grind", "noise", "vibrat", "jerk", "stuck", "slow", "door"],
    "HVAC": ["hot", "warm", "stuffy", "cold", "freez", "ac ", "a/c", "air", "vent", "fan", "loud"],
    "Pump": ["rattl", "noise", "vibrat", "pump", "leak", "pressure"],
    "Boiler": ["hot water", "lukewarm", "cold water", "heat", "shower"],
    "ElectricalPanel": ["burn", "smell", "hot", "flicker", "trip", "outlet", "power"],
    "Generator": ["generator", "power", "outage"],
}

# failure mode -> (action, duration minutes, effectiveness)
ACTIONS = {
    "Motor/bearing degradation": ("Inspect motor assembly and bearing system; measure bearing temperature and vibration spectrum, lubricate or replace bearing", 45, 0.68),
    "Door operator wear": ("Service door operator: adjust closer, replace rollers and verify door sensors", 60, 0.60),
    "Guide rail / roller misalignment": ("Inspect guide rails and roller guides; realign and lubricate", 60, 0.60),
    "Fan motor degradation": ("Inspect fan motor bearings and belt tension; measure current draw under load and replace bearings if rough", 60, 0.65),
    "Cooling coil / compressor performance loss": ("Check chilled-water valve position, coil condition and compressor performance", 90, 0.60),
    "Damper / control fault": ("Verify damper actuator travel and the controls sequence; recalibrate sensors", 45, 0.55),
    "Bearing wear / impeller imbalance": ("Inspect pump bearings, shaft seal and impeller; check alignment and vibration spectrum", 60, 0.65),
    "Impeller wear / cavitation": ("Inspect impeller and suction conditions; clean strainer and check NPSH", 60, 0.60),
    "Discharge restriction": ("Check discharge valve position and line restrictions", 30, 0.50),
    "Pressure control / relief valve instability": ("Test operating pressure control and relief valve; inspect burner modulation", 120, 0.60),
    "Heat exchanger fouling": ("Inspect and clean heat exchanger; run combustion analysis", 180, 0.60),
    "Burner control drift": ("Calibrate burner controls and water temperature setpoint", 90, 0.55),
    "Loose connection / overheating breaker": ("Infrared scan and torque check of panel connections; replace the overheating breaker", 45, 0.70),
    "Overload condition": ("Perform a load study and rebalance circuits", 60, 0.55),
    "Phase imbalance": ("Measure phase voltages and inspect feeder connections", 45, 0.55),
    "Starting battery degradation": ("Load-test and replace starting batteries", 45, 0.70),
    "Cooling system fault": ("Inspect coolant level, thermostat and radiator", 60, 0.55),
    "Overdue preventive maintenance": ("Complete the overdue preventive maintenance and inspection", 120, 0.45),
    "No significant degradation detected": ("Continue routine monitoring; perform the next preventive maintenance as scheduled", 30, 0.20),
}


# ---------------------------------------------------------------------------- helpers
def _clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def _ms(d):
    if d is None:
        return None
    try:
        return int(d.millis)
    except Exception:
        pass
    try:
        return int(d.timestamp() * 1000)
    except Exception:
        pass
    try:
        return int(c3.DateTime.fromString(str(d)).millis)
    except Exception:
        return None


def _iso(d):
    return str(d) if d is not None else None


def _mean(xs):
    xs = list(xs)
    return sum(xs) / float(len(xs)) if xs else 0.0


def _slope(ys):
    """Least-squares slope of ys against index (units per step)."""
    n = len(ys)
    if n < 3:
        return 0.0
    mx = (n - 1) / 2.0
    my = _mean(ys)
    num = sum((x - mx) * (y - my) for x, y in zip(range(n), ys))
    den = sum((x - mx) ** 2 for x in range(n))
    return num / den if den else 0.0


def _sigmoid(x):
    return 1.0 / (1.0 + math.exp(-x))


def _risk_level(p):
    if p >= 0.80:
        return "Critical"
    if p >= 0.60:
        return "High"
    if p >= 0.35:
        return "Moderate"
    return "Low"


def _window(p):
    if p >= 0.85:
        return "2–4 days"
    if p >= 0.70:
        return "4–7 days"
    if p >= 0.50:
        return "1–2 weeks"
    if p >= 0.35:
        return "2–4 weeks"
    return "No failure expected within 30 days"


def _timeframe(p):
    if p >= 0.80:
        return "Within 24 hours"
    if p >= 0.60:
        return "Within 72 hours"
    if p >= 0.35:
        return "Within 7 days"
    return "At next scheduled maintenance"


def _status_for_health(h):
    if h >= 90:
        return "Healthy"
    if h >= 75:
        return "Monitor"
    if h >= 50:
        return "Warning"
    return "Critical"


def _infer_failure_mode(asset_type, sev, overdue):
    abnormal = set(k for k, v in sev.items() if v >= 0.35)
    if not abnormal:
        return "Overdue preventive maintenance" if overdue >= 0.3 else "No significant degradation detected"
    if asset_type == "Elevator":
        if {"MotorCurrent", "MotorTemperature"} & abnormal or ("Vibration" in abnormal and len(abnormal) > 1):
            return "Motor/bearing degradation"
        if "DoorCycleTime" in abnormal:
            return "Door operator wear"
        return "Guide rail / roller misalignment"
    if asset_type == "HVAC":
        if "FanCurrent" in abnormal or "Airflow" in abnormal:
            return "Fan motor degradation"
        if "SupplyTemperature" in abnormal:
            return "Cooling coil / compressor performance loss"
        return "Damper / control fault"
    if asset_type == "Pump":
        if "Vibration" in abnormal or "MotorCurrent" in abnormal:
            return "Bearing wear / impeller imbalance"
        if "FlowRate" in abnormal:
            return "Impeller wear / cavitation"
        return "Discharge restriction"
    if asset_type == "Boiler":
        if "Pressure" in abnormal:
            return "Pressure control / relief valve instability"
        if "FlueTemperature" in abnormal:
            return "Heat exchanger fouling"
        return "Burner control drift"
    if asset_type == "ElectricalPanel":
        if "PanelTemperature" in abnormal:
            return "Loose connection / overheating breaker"
        if "LoadCurrent" in abnormal:
            return "Overload condition"
        return "Phase imbalance"
    if asset_type == "Generator":
        if "BatteryVoltage" in abnormal:
            return "Starting battery degradation"
        return "Cooling system fault"
    return "No significant degradation detected"


def _sensor_stats(sensor, readings):
    """Per-sensor statistics for the asset page and the model."""
    readings = sorted(readings, key=lambda r: _ms(r.timestamp) or 0)
    vals = [float(r.value) for r in readings]
    if not vals:
        return None
    mean = float(sensor.baselineMean) if sensor.baselineMean is not None else _mean(vals[:96] or vals)
    if sensor.baselineStdDev:
        sd = float(sensor.baselineStdDev)
    else:
        head = vals[:96] or vals
        sd = max(1e-6, (sum((v - mean) ** 2 for v in head) / max(1, len(head))) ** 0.5)
    direction = int(sensor.badDirection) if sensor.badDirection is not None else 1
    z = [(v - mean) / sd for v in vals]

    def bad(zv):
        return abs(zv) if direction == 0 else max(0.0, direction * zv)

    last24 = z[-24:]
    zbad24 = _mean(bad(zv) for zv in last24)
    severity = _clamp(zbad24 / 4.0)
    dev_pct = (_mean(vals[-24:]) - mean) / mean * 100.0 if mean else 0.0
    anomalies24 = sum(1 for zv in last24 if abs(zv) > 2.5)
    anomalies_total = sum(1 for zv in z if abs(zv) > 2.5)
    slope_day = _slope(z[-72:]) * 24.0
    trend = _clamp((abs(slope_day) if direction == 0 else direction * slope_day) / 2.0)
    daily = [_mean(z[i:i + 24]) for i in range(max(0, len(z) - 96), len(z), 24)]
    rising = 0
    for i in range(len(daily) - 1, 0, -1):
        if (daily[i] - daily[i - 1]) * (1 if direction >= 0 else -1) > 0.15:
            rising += 1
        else:
            break
    anomaly_start = None
    flags = [abs(zv) > 2.5 for zv in z]
    for i in range(max(0, len(flags) - 120), len(flags)):
        if flags[i] and sum(flags[i:i + 6]) >= 3:
            anomaly_start = _iso(readings[i].timestamp)
            break
    return {
        "sensorId": sensor.id,
        "name": sensor.name or SENSOR_LABEL.get(sensor.sensorType, sensor.sensorType),
        "sensorType": sensor.sensorType,
        "unit": sensor.unit,
        "baselineMean": mean,
        "baselineStdDev": sd,
        "badDirection": direction,
        "latestValue": vals[-1],
        "mean24h": _mean(vals[-24:]),
        "deviationPct": round(dev_pct, 1),
        "zBad24h": round(zbad24, 2),
        "severity": round(severity, 3),
        "anomalies24h": anomalies24,
        "anomaliesTotal": anomalies_total,
        "trendSdPerDay": round(slope_day, 2),
        "trend": round(trend, 3),
        "risingDays": rising,
        "anomalyStartAt": anomaly_start,
        "readingCount": len(vals),
    }


def _phase1(asset, sensors, readings_by_sensor):
    """Sensor-only features for one asset (anomaly severity A and trend T)."""
    stats = []
    for s in sensors:
        st = _sensor_stats(s, readings_by_sensor.get(s.id, []))
        if st:
            stats.append(st)
    sevs = [st["severity"] for st in stats]
    return {
        "asset": asset,
        "stats": stats,
        "sev": dict((st["sensorType"], st["severity"]) for st in stats),
        "A": _clamp(0.6 * max(sevs) + 0.4 * _mean(sevs)) if sevs else 0.0,
        "T": max([st["trend"] for st in stats]) if stats else 0.0,
    }


MECH_WORDS = ["shak", "shook", "grind", "noise", "vibrat", "jerk", "rattl", "loud", "pump"]
HEAT_WORDS = ["hot water", "lukewarm", "cold water", "shower", "heat", "radiator", "freezing", "cold"]


def _plausible(asset_type, category, text):
    """Can a report of this category / wording plausibly describe this asset type? Mirrors the triage rules so the
    engine and the triage link reports the same way (a ceiling leak is not a condensate-pump failure)."""
    t = " {} ".format((text or "").lower())
    if category not in CATEGORIES_FOR_TYPE.get(asset_type, []):
        return False
    if asset_type == "Pump":
        return any(w in t for w in MECH_WORDS)
    if asset_type == "Boiler":
        return any(w in t for w in HEAT_WORDS)
    if asset_type == "Generator":
        return any(w in t for w in ["generator", "power", "outage"])
    return True


def _attribute_reports(phase1_list, reports, now_ms):
    """Assign each unresolved report of the last 7 days to ONE plausible asset: same building, category and wording
    matching the asset type, preferring the most anomalous candidate — so human reports corroborate the machine
    signal they most plausibly describe, independent of triage order."""
    week_ago = now_ms - 7 * DAY_MS
    attributed = dict((ph["asset"].id, []) for ph in phase1_list)
    for r in reports:
        if r.status == "Resolved" or (_ms(r.timestamp) or 0) < week_ago:
            continue
        linked = r.asset.id if (r.asset and r.asset.id) else None
        cands = []
        if r.building:
            cands = [ph for ph in phase1_list if ph["asset"].building and ph["asset"].building.id == r.building.id
                     and _plausible(ph["asset"].assetType, r.category, r.description)]
        if not cands:
            if linked and linked in attributed:
                attributed[linked].append(r)
            continue
        best = max(cands, key=lambda ph: (round(ph["A"], 2), 1 if linked == ph["asset"].id else 0, float(ph["asset"].currentFailureProbability or 0.0)))
        if best["A"] < 0.15 and linked in [c["asset"].id for c in cands]:
            best = [c for c in cands if c["asset"].id == linked][0]
        attributed[best["asset"].id].append(r)
    return attributed


def _correlation_confidence(asset_type, sev, reports, mode_history_match, anomaly_start_ms):
    if not reports:
        return 0.0
    has_anomaly = 1.0 if any(v >= 0.35 for v in sev.values()) else 0.0
    kws = REPORT_KEYWORDS.get(asset_type, [])
    kw_hits = sum(1 for r in reports if any(k in (r.description or "").lower() for k in kws))
    kw_match = kw_hits / float(len(reports))
    if anomaly_start_ms:
        overlap = sum(1 for r in reports if (_ms(r.timestamp) or 0) >= anomaly_start_ms - 12 * HOUR_MS) / float(len(reports))
    else:
        overlap = 0.0
    conf = 0.35 * has_anomaly + 0.2 * _clamp(len(reports) / 3.0) + 0.2 * kw_match + 0.15 * overlap + 0.1 * (1.0 if mode_history_match else 0.0)
    return round(_clamp(conf, 0.0, 0.96), 2)


def _score(ph, related, history, now_ms):
    asset, stats, sev, A, T = ph["asset"], ph["stats"], ph["sev"], ph["A"], ph["T"]
    sevs = [st["severity"] for st in stats]

    next_ms = _ms(asset.nextScheduledMaintenanceDate)
    days_overdue = max(0.0, (now_ms - next_ms) / DAY_MS) if next_ms else 0.0
    O = _clamp(days_overdue / 30.0)
    mode = _infer_failure_mode(asset.assetType, sev, O)
    R = _clamp(len(related) / 3.0)
    hist = [h for h in history if h.asset and h.asset.id == asset.id]
    match = [h for h in hist if h.failureMode == mode and h.maintenanceType in ("Corrective", "Emergency", "Replacement")]
    H = 1.0 if match else 0.0

    logit = INTERCEPT + W_A * A + W_T * T + W_R * R + W_H * H + W_O * O
    p = _sigmoid(logit)
    crit_w = CRIT_W.get(asset.assetCriticality, 0.5)
    access_w = ACCESS_W.get(asset.accessibilityImpact, 0.0)
    people = float(asset.estimatedPeopleAffected or 0)
    people_w = _clamp(people / 1500.0)
    ops_w = OPS_W.get(asset.assetType, 0.5)

    # Health: 100 minus penalty points (p, A, O, R are 0-1 → max penalty 30+12+8+6+8 = 64 points)
    health = _clamp(100.0 - (30.0 * p + 12.0 * A + 8.0 * O + 6.0 * R + 8.0 * p * crit_w), 0.0, 100.0)

    # Priority: impact factors are scaled by how likely the failure is (full weight from p >= 0.6)
    risk_scale = _clamp(p / 0.6)
    breakdown = [
        {"factor": "Predicted failure risk", "weight": 0.35, "value": round(p, 3), "points": round(100 * 0.35 * p, 1), "detail": "failure probability {:.0f}%".format(p * 100)},
        {"factor": "Safety / asset criticality", "weight": 0.20, "value": crit_w, "points": round(100 * 0.20 * crit_w * risk_scale, 1), "detail": "criticality {}".format(asset.assetCriticality)},
        {"factor": "Accessibility impact", "weight": 0.15, "value": access_w, "points": round(100 * 0.15 * access_w * risk_scale, 1), "detail": "accessibility impact {}".format(asset.accessibilityImpact)},
        {"factor": "People affected", "weight": 0.15, "value": round(people_w, 2), "points": round(100 * 0.15 * people_w * risk_scale, 1), "detail": "~{:,.0f} daily users".format(people)},
        {"factor": "Operational impact", "weight": 0.10, "value": ops_w, "points": round(100 * 0.10 * ops_w * risk_scale, 1), "detail": "{} service".format(asset.assetType)},
        {"factor": "Supporting human reports", "weight": 0.05, "value": round(R, 2), "points": round(100 * 0.05 * R, 1), "detail": "{} report(s) in 7 days".format(len(related))},
    ]
    priority = _clamp(sum(b["points"] for b in breakdown), 0.0, 100.0)
    if days_overdue > 0:
        breakdown.append({"factor": "Maintenance overdue", "weight": 0.0, "value": round(O, 2), "points": 0.0,
                          "detail": "{:.0f} days past scheduled PM (feeds failure risk)".format(days_overdue)})

    # Contributing signals: sensors first (ordered by contribution), then corroborating evidence
    sensor_signals = []
    total_sev = sum(sevs) or 1.0
    for st in sorted(stats, key=lambda s: -s["severity"]):
        if st["severity"] < 0.15:
            continue
        sign = "+" if st["deviationPct"] >= 0 else ""
        detail = "{}{:.1f}% vs baseline (z {:.1f}); {} of last 24 readings anomalous".format(sign, st["deviationPct"], st["zBad24h"], st["anomalies24h"])
        if st["risingDays"] >= 2:
            detail += "; trend up {} consecutive days".format(st["risingDays"])
        elif abs(st["trendSdPerDay"]) >= 0.5:
            detail += "; {:+.1f}σ/day trend".format(st["trendSdPerDay"])
        sensor_signals.append({"signal": st["name"], "kind": "sensor", "detail": detail,
                               "contribution": round(W_A * A * (st["severity"] / total_sev), 2)})
    other = []
    if related:
        kws = REPORT_KEYWORDS.get(asset.assetType, [])
        kw_hits = sum(1 for r in related if any(k in (r.description or "").lower() for k in kws))
        other.append({"signal": "Human reports", "kind": "reports",
                      "detail": "{} report(s) in the last 7 days; {} mention symptoms consistent with {}".format(len(related), kw_hits, mode.lower()),
                      "contribution": round(W_R * R, 2)})
    if match:
        h = sorted(match, key=lambda x: -(_ms(x.serviceDate) or 0))[0]
        other.append({"signal": "Maintenance history", "kind": "history",
                      "detail": "{} '{}' on {}: a similar pattern preceded the last failure".format(h.maintenanceType, h.failureMode, (_iso(h.serviceDate) or "")[:10]),
                      "contribution": round(W_H * H, 2)})
    if T > 0.3:
        other.append({"signal": "Degradation trend", "kind": "trend",
                      "detail": "worst channel drifting {:.1f}σ/day in the unhealthy direction".format(max(st["trendSdPerDay"] for st in stats)),
                      "contribution": round(W_T * T, 2)})
    if days_overdue > 0:
        other.append({"signal": "Maintenance overdue", "kind": "overdue",
                      "detail": "{:.0f} days past scheduled preventive maintenance".format(days_overdue),
                      "contribution": round(W_O * O, 2)})
    other.sort(key=lambda s: -s["contribution"])
    signals = sensor_signals + other

    abnormal_sensors = sum(1 for v in sevs if v >= 0.35)
    confidence = _clamp(0.35 + 0.1 * min(abnormal_sensors, 4) + 0.12 * (1.0 if related else 0.0) + 0.1 * H + 0.05 * (1.0 if T > 0.3 else 0.0)
                        + 0.08 * (1.0 if stats and min(st["readingCount"] for st in stats) >= 160 else 0.0), 0.3, 0.93)
    anomaly_starts = [_ms(c3.DateTime.fromString(st["anomalyStartAt"])) for st in stats if st["anomalyStartAt"] and st["severity"] >= 0.35]
    anomaly_start_ms = min(anomaly_starts) if anomaly_starts else None
    corr = _correlation_confidence(asset.assetType, sev, related, H > 0, anomaly_start_ms)

    action, minutes, effectiveness = ACTIONS.get(mode, ACTIONS["No significant degradation detected"])
    skill = SKILL_FOR_TYPE.get(asset.assetType, "General")
    projected_p = round(p * (1.0 - effectiveness), 3)
    reason_bits = ["{} {}".format(s["signal"], s["detail"].split(";")[0]) if s["kind"] == "sensor" else s["detail"] for s in signals[:4]]
    recommendation = {
        "recommendedAction": action,
        "recommendedTimeframe": _timeframe(p),
        "reason": "; ".join(reason_bits) if reason_bits else "No abnormal telemetry; routine monitoring.",
        "estimatedInspectionDuration": minutes,
        "priorityScore": round(priority, 1),
        "expectedRiskReduction": round(p - projected_p, 3),
        "projectedFailureProbability": projected_p,
        "requiredSkill": skill,
    }
    return {
        "assetId": asset.id,
        "assetName": asset.assetName,
        "assetType": asset.assetType,
        "buildingId": asset.building.id if asset.building else None,
        "buildingName": asset.building.shortName if asset.building else None,
        "failureProbability": round(p, 3),
        "riskLevel": _risk_level(p),
        "predictedFailureWindow": _window(p),
        "predictedFailureMode": mode,
        "confidence": round(confidence, 2),
        "anomalyScore": round(A, 3),
        "healthScore": round(health, 1),
        "status": _status_for_health(health),
        "priorityScore": round(priority, 1),
        "priorityBreakdown": breakdown,
        "features": {"A": round(A, 3), "T": round(T, 3), "R": round(R, 3), "H": H, "O": round(O, 3), "logit": round(logit, 3),
                     "daysOverdue": round(days_overdue, 1), "abnormalSensors": abnormal_sensors},
        "sensors": stats,
        "topContributingSignals": signals,
        "supportingReportCount": len(related),
        "relatedReportIds": [r.id for r in related],
        "correlationConfidence": corr,
        "anomalyStartAt": _iso(c3.DateTime.fromMillis(anomaly_start_ms)) if anomaly_start_ms else None,
        "recommendation": recommendation,
        "modelVersion": MODEL_VERSION,
    }


# ---------------------------------------------------------------------------- data access
ASSET_INCLUDE = "this, building.id, building.shortName, building.name, building.estimatedDailyOccupancy, zone.id, zone.name"


def _load_context(building_id=None):
    kwargs = {"include": ASSET_INCLUDE, "limit": -1}
    if building_id:
        kwargs["filter"] = c3.Filter.eq("building.id", building_id)
    assets = list(c3.MaintenanceAsset.fetch(**kwargs).objs or [])
    sensors = list(c3.Sensor.fetch(include="this, asset.id", limit=-1).objs or [])
    reports = list(c3.StudentReport.fetch(include="this, asset.id, building.id, zone.id", limit=-1).objs or [])
    history = list(c3.MaintenanceHistory.fetch(include="this, asset.id", limit=-1).objs or [])
    return assets, sensors, reports, history


def _readings_for_asset(asset_id):
    rows = list(c3.SensorReading.fetch(filter=c3.Filter.eq("sensor.asset.id", asset_id),
                                        include="id, value, timestamp, isAnomaly, anomalyScore, sensor.id",
                                        order="timestamp", limit=-1).objs or [])
    by_sensor = {}
    for r in rows:
        by_sensor.setdefault(r.sensor.id, []).append(r)
    return by_sensor


def _phase1_for(assets, sensors, refresh_flags=False):
    sensors_by_asset = {}
    for s in sensors:
        if s.asset:
            sensors_by_asset.setdefault(s.asset.id, []).append(s)
    out = []
    flags = 0
    for a in assets:
        mine = sensors_by_asset.get(a.id, [])
        by_sensor = _readings_for_asset(a.id) if mine else {}
        if refresh_flags:
            flags += _refresh_anomaly_flags(by_sensor, dict((s.id, s) for s in mine))
        out.append(_phase1(a, mine, by_sensor))
    return out, flags


def _persist(result, now):
    aid = result["assetId"]
    old = list(c3.FailurePrediction.fetch(filter=c3.Filter.eq("asset.id", aid).and_(c3.Filter.eq("isCurrent", True)), include="id", limit=-1).objs or [])
    if old:
        c3.FailurePrediction.mergeBatch([c3.FailurePrediction.make({"id": o.id, "isCurrent": False}) for o in old])
    old_rec = list(c3.MaintenanceRecommendation.fetch(filter=c3.Filter.eq("asset.id", aid).and_(c3.Filter.eq("isCurrent", True)), include="id", limit=-1).objs or [])
    if old_rec:
        c3.MaintenanceRecommendation.mergeBatch([c3.MaintenanceRecommendation.make({"id": o.id, "isCurrent": False}) for o in old_rec])
    stamp = int(now.millis)
    pid = "fp_{}_{}".format(aid[4:], stamp)
    c3.FailurePrediction.make({
        "id": pid, "asset": {"id": aid}, "generatedAt": now,
        "failureProbability": result["failureProbability"], "predictedFailureWindow": result["predictedFailureWindow"],
        "predictedFailureMode": result["predictedFailureMode"], "confidence": result["confidence"],
        "anomalyScore": result["anomalyScore"], "riskLevel": result["riskLevel"],
        "topContributingSignals": result["topContributingSignals"], "healthScore": result["healthScore"],
        "priorityScore": result["priorityScore"], "priorityBreakdown": result["priorityBreakdown"],
        "modelFeatures": {"features": result["features"], "sensors": result["sensors"], "anomalyStartAt": result["anomalyStartAt"],
                          "relatedReportIds": result["relatedReportIds"]},
        "supportingReportCount": result["supportingReportCount"], "correlationConfidence": result["correlationConfidence"],
        "isCurrent": True, "modelVersion": MODEL_VERSION,
    }).create()
    rec = dict(result["recommendation"])
    rec.update({"id": "mr_{}_{}".format(aid[4:], stamp), "asset": {"id": aid}, "prediction": {"id": pid}, "isCurrent": True})
    c3.MaintenanceRecommendation.make(rec).create()
    result["predictionId"] = pid
    return pid


def _asset_rollup(result, current_status):
    status = result["status"]
    if current_status in ("Offline", "Maintenance"):
        status = current_status
    return c3.MaintenanceAsset.make({
        "id": result["assetId"], "healthScore": result["healthScore"], "currentFailureProbability": result["failureProbability"],
        "priorityScore": result["priorityScore"], "status": status,
    })


def _building_rollups(reports):
    assets = list(c3.MaintenanceAsset.fetch(include="id, healthScore, status, assetCriticality, building.id, currentFailureProbability", limit=-1).objs or [])
    buildings = list(c3.CampusBuilding.fetch(include="id, estimatedDailyOccupancy", limit=-1).objs or [])
    by_b = {}
    for a in assets:
        if a.building:
            by_b.setdefault(a.building.id, []).append(a)
    updates = []
    campus_num, campus_den = 0.0, 0.0
    out = {}
    for b in buildings:
        group = by_b.get(b.id, [])
        if group:
            ws = [CRIT_W.get(a.assetCriticality, 0.5) for a in group]
            hs = [float(a.healthScore if a.healthScore is not None else 95.0) for a in group]
            bh = 0.6 * (sum(w * h for w, h in zip(ws, hs)) / sum(ws)) + 0.4 * min(hs)
        else:
            bh = 100.0
        bh = round(bh, 1)
        occ = float(b.estimatedDailyOccupancy or 1)
        campus_num += bh * occ
        campus_den += occ
        active = sum(1 for r in reports if r.building and r.building.id == b.id and r.status != "Resolved")
        high = sum(1 for a in group if (a.currentFailureProbability or 0) >= 0.6)
        crit = sum(1 for a in group if a.status == "Critical")
        # building colour: any Critical asset → Critical; any high-risk asset → Warning; else by health band
        status = "Critical" if crit else ("Warning" if high else ("Monitor" if bh < 90 else "Healthy"))
        if _status_for_health(bh) == "Critical":
            status = "Critical"
        out[b.id] = {"health": bh, "status": status, "activeIncidents": active, "highRisk": high, "critical": crit}
        updates.append(c3.CampusBuilding.make({"id": b.id, "overallHealthScore": bh, "healthStatus": status,
                                               "activeIncidentCount": active, "highRiskAssetCount": high, "criticalAssetCount": crit}))
    if updates:
        c3.CampusBuilding.mergeBatch(updates)
    campus = round(campus_num / campus_den, 1) if campus_den else 100.0
    return campus, out


def _refresh_anomaly_flags(by_sensor, sensors_by_id):
    changed = []
    for sid, rows in by_sensor.items():
        s = sensors_by_id.get(sid)
        if not s or not s.baselineStdDev:
            continue
        mean, sd = float(s.baselineMean), float(s.baselineStdDev)
        for r in rows:
            z = abs(float(r.value) - mean) / sd
            flag = z > 2.5
            if bool(r.isAnomaly) != flag or r.anomalyScore is None or abs(float(r.anomalyScore) - z) > 0.01:
                changed.append(c3.SensorReading.make({"id": r.id, "anomalyScore": round(z, 3), "isAnomaly": flag}))
    for i in range(0, len(changed), 1000):
        c3.SensorReading.mergeBatch(changed[i:i + 1000])
    return len(changed)


def _score_single(assetId, refresh_flags):
    target = c3.MaintenanceAsset.forId(assetId).get("id, building.id")
    if not target:
        raise ValueError("Unknown asset " + str(assetId))
    # siblings in the same building are needed so human reports are attributed consistently
    assets, sensors, reports, history = _load_context(target.building.id if target.building else None)
    now = c3.DateTime.now()
    now_ms = int(now.millis)
    phase1, _ = _phase1_for(assets, sensors, refresh_flags)
    attributed = _attribute_reports(phase1, reports, now_ms)
    ph = [p for p in phase1 if p["asset"].id == assetId]
    if not ph:
        raise ValueError("Unknown asset " + str(assetId))
    return _score(ph[0], attributed.get(assetId, []), history, now_ms), ph[0]["asset"], reports, now


# ---------------------------------------------------------------------------- API
def scoreAsset(cls, assetId):
    result, _, _, _ = _score_single(assetId, False)
    return result


def recomputeAsset(cls, assetId):
    result, asset, reports, now = _score_single(assetId, True)
    _persist(result, now)
    c3.MaintenanceAsset.mergeBatch([_asset_rollup(result, asset.status)])
    campus, _ = _building_rollups(reports)
    result["campusHealth"] = campus
    return result


def recomputeAll(cls):
    start = c3.DateTime.now()
    assets, sensors, reports, history = _load_context()
    now = c3.DateTime.now()
    now_ms = int(now.millis)
    phase1, flags_changed = _phase1_for(assets, sensors, True)
    attributed = _attribute_reports(phase1, reports, now_ms)
    results = []
    rollups = []
    for ph in phase1:
        res = _score(ph, attributed.get(ph["asset"].id, []), history, now_ms)
        _persist(res, now)
        rollups.append(_asset_rollup(res, ph["asset"].status))
        results.append(res)
    if rollups:
        c3.MaintenanceAsset.mergeBatch(rollups)
    campus, buildings = _building_rollups(reports)
    # re-link human reports now that probabilities are fresh (the triage picks the most likely asset)
    try:
        c3.IlliniFixTriage.triageAll()
    except Exception:
        pass
    end = c3.DateTime.now()
    summary = [{"assetId": r["assetId"], "assetName": r["assetName"], "failureProbability": r["failureProbability"],
                "riskLevel": r["riskLevel"], "healthScore": r["healthScore"], "status": r["status"], "priorityScore": r["priorityScore"],
                "predictedFailureMode": r["predictedFailureMode"], "supportingReportCount": r["supportingReportCount"]}
               for r in sorted(results, key=lambda r: -r["priorityScore"])]
    return {"assetsScored": len(results), "campusHealth": campus, "buildings": buildings, "anomalyFlagsUpdated": flags_changed,
            "predictions": summary, "modelVersion": MODEL_VERSION, "durationMs": int(end.millis) - int(start.millis), "generatedAt": str(now)}
