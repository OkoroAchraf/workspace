#!/usr/bin/env python3
"""
IlliniFix — synthetic demo dataset generator (SIMULATED DATA, not real UIUC telemetry).

Writes JSON rows under ``<pkg>/data/<TypeName>/`` for:
  CampusBuilding, CampusZone, MaintenanceAsset, Sensor, SensorReading,
  StudentReport, MaintenanceHistory, MaintenanceCrew, WorkOrder

Telemetry uses the SAME deterministic hash-noise formula as ``src/IlliniFixDemo.py``
(``_u`` / ``_gauss`` / ``reading_value``), so Demo Mode can regenerate or reset any
sensor's series in the live app and land on identical values.

Run:  python3 resource/generate_demo_data.py            (from the package folder)
"""
import datetime as dt
import hashlib
import json
import math
import os

PKG = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
DATA = os.path.join(PKG, "data")
HOURS = 168  # 7 days of hourly telemetry
NOW = dt.datetime.now(dt.timezone.utc).replace(minute=0, second=0, microsecond=0)


def iso(d: dt.datetime) -> str:
    return d.strftime("%Y-%m-%dT%H:%M:%S.000Z")


def hours_ago(h: float) -> str:
    return iso(NOW - dt.timedelta(hours=h))


def days_ago(d: float) -> str:
    return iso(NOW - dt.timedelta(days=d))


def days_ahead(d: float) -> str:
    return iso(NOW + dt.timedelta(days=d))


# --------------------------------------------------------------------------------------
# Deterministic noise — MUST stay byte-identical with src/IlliniFixDemo.py
# --------------------------------------------------------------------------------------
def _u(key: str, salt: str) -> float:
    h = hashlib.sha256(f"{key}|{salt}".encode("utf-8")).hexdigest()
    return int(h[:12], 16) / float(16 ** 12)


def _gauss(key: str, salt: str) -> float:
    u1 = max(_u(key, f"{salt}a"), 1e-12)
    u2 = _u(key, f"{salt}b")
    return math.sqrt(-2.0 * math.log(u1)) * math.cos(2.0 * math.pi * u2)


def reading_value(sensor_id, mean, sd, diurnal_amp, idx, hour_of_day, profile=None, total=HOURS):
    """Baseline (mean + diurnal cycle + gaussian noise) plus an optional degradation profile.

    profile = {"driftPct": 0.19, "startHoursBeforeEnd": 72, "shape": 1.4, "noiseMult": 2.0}
    progress runs 0 → 1 over the last ``startHoursBeforeEnd`` hours of the series.
    """
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
                value += sd * extra * progress * _gauss(sensor_id, f"n{idx}")
    return value


# --------------------------------------------------------------------------------------
# Master data
# --------------------------------------------------------------------------------------
BUILDINGS = [
    dict(id="bld_grainger", name="Grainger Engineering Library", shortName="Grainger",
         address="1301 W Springfield Ave, Urbana, IL 61801", latitude=40.11247, longitude=-88.22682,
         estimatedDailyOccupancy=6500, criticalityScore=85, accessibilityCriticality="High"),
    dict(id="bld_siebel", name="Siebel Center for Computer Science", shortName="Siebel",
         address="201 N Goodwin Ave, Urbana, IL 61801", latitude=40.11383, longitude=-88.22493,
         estimatedDailyOccupancy=3200, criticalityScore=75, accessibilityCriticality="Moderate"),
    dict(id="bld_cif", name="Campus Instructional Facility", shortName="CIF",
         address="1405 W Springfield Ave, Urbana, IL 61801", latitude=40.11279, longitude=-88.22831,
         estimatedDailyOccupancy=4800, criticalityScore=80, accessibilityCriticality="High"),
    dict(id="bld_eceb", name="Electrical and Computer Engineering Building", shortName="ECEB",
         address="306 N Wright St, Urbana, IL 61801", latitude=40.11491, longitude=-88.22802,
         estimatedDailyOccupancy=3900, criticalityScore=78, accessibilityCriticality="Moderate"),
    dict(id="bld_arc", name="Activities and Recreation Center", shortName="ARC",
         address="201 E Peabody Dr, Champaign, IL 61820", latitude=40.10095, longitude=-88.23596,
         estimatedDailyOccupancy=7000, criticalityScore=70, accessibilityCriticality="Moderate"),
    dict(id="bld_isr", name="Illinois Street Residence Hall", shortName="ISR",
         address="1010 W Illinois St, Urbana, IL 61801", latitude=40.10998, longitude=-88.22140,
         estimatedDailyOccupancy=1400, criticalityScore=90, accessibilityCriticality="High"),
]

ZONES = [
    dict(id="zone_grainger_f1", building="bld_grainger", name="Grainger Floor 1 Commons", floor=1, zoneType="Library", estimatedOccupancy=1800, requiresAccessibleRoute=True),
    dict(id="zone_grainger_f2", building="bld_grainger", name="Grainger Floor 2", floor=2, zoneType="Library", estimatedOccupancy=1400, requiresAccessibleRoute=True),
    dict(id="zone_grainger_f4", building="bld_grainger", name="Grainger Floor 4 Quiet Study", floor=4, zoneType="Library", estimatedOccupancy=900, requiresAccessibleRoute=True),
    dict(id="zone_grainger_mech", building="bld_grainger", name="Grainger Mechanical Penthouse", floor=5, zoneType="MechanicalRoom", estimatedOccupancy=5, requiresAccessibleRoute=False),
    dict(id="zone_siebel_atrium", building="bld_siebel", name="Siebel Atrium", floor=1, zoneType="Lobby", estimatedOccupancy=900, requiresAccessibleRoute=True),
    dict(id="zone_siebel_labs", building="bld_siebel", name="Siebel 2nd Floor Labs", floor=2, zoneType="Lab", estimatedOccupancy=700, requiresAccessibleRoute=False),
    dict(id="zone_siebel_mech", building="bld_siebel", name="Siebel Basement Mechanical", floor=0, zoneType="MechanicalRoom", estimatedOccupancy=4, requiresAccessibleRoute=False),
    dict(id="zone_cif_lecture", building="bld_cif", name="CIF Lecture Wing", floor=2, zoneType="LectureWing", estimatedOccupancy=1600, requiresAccessibleRoute=True),
    dict(id="zone_cif_lobby", building="bld_cif", name="CIF Ground Floor Lobby", floor=1, zoneType="Lobby", estimatedOccupancy=1200, requiresAccessibleRoute=True),
    dict(id="zone_cif_mech", building="bld_cif", name="CIF Rooftop Mechanical", floor=4, zoneType="MechanicalRoom", estimatedOccupancy=3, requiresAccessibleRoute=False),
    dict(id="zone_eceb_east", building="bld_eceb", name="ECEB East Wing", floor=2, zoneType="Lab", estimatedOccupancy=800, requiresAccessibleRoute=False),
    dict(id="zone_eceb_aud", building="bld_eceb", name="ECEB Auditorium Level", floor=1, zoneType="LectureWing", estimatedOccupancy=900, requiresAccessibleRoute=True),
    dict(id="zone_eceb_mech", building="bld_eceb", name="ECEB Mechanical Room", floor=0, zoneType="MechanicalRoom", estimatedOccupancy=4, requiresAccessibleRoute=False),
    dict(id="zone_arc_gym", building="bld_arc", name="ARC Main Gym", floor=1, zoneType="Gym", estimatedOccupancy=2500, requiresAccessibleRoute=True),
    dict(id="zone_arc_pool", building="bld_arc", name="ARC Pool Deck", floor=1, zoneType="Gym", estimatedOccupancy=600, requiresAccessibleRoute=True),
    dict(id="zone_arc_mech", building="bld_arc", name="ARC Mechanical Room", floor=0, zoneType="MechanicalRoom", estimatedOccupancy=4, requiresAccessibleRoute=False),
    dict(id="zone_isr_townsend", building="bld_isr", name="ISR Townsend Tower", floor=5, zoneType="Residential", estimatedOccupancy=500, requiresAccessibleRoute=True),
    dict(id="zone_isr_wardall", building="bld_isr", name="ISR Wardall Tower", floor=6, zoneType="Residential", estimatedOccupancy=500, requiresAccessibleRoute=True),
    dict(id="zone_isr_dining", building="bld_isr", name="ISR Dining & Lobby", floor=1, zoneType="Lobby", estimatedOccupancy=1000, requiresAccessibleRoute=True),
    dict(id="zone_isr_boiler", building="bld_isr", name="ISR Boiler Room", floor=0, zoneType="MechanicalRoom", estimatedOccupancy=3, requiresAccessibleRoute=False),
]

# Sensor templates per asset type: (sensorType, display name, unit, mean, sd, diurnalAmp, badDirection)
SENSOR_TEMPLATES = {
    "Elevator": [
        ("MotorCurrent", "Motor Current", "A", 42.0, 1.6, 0.6, 1),
        ("Vibration", "Vibration", "mm/s", 2.4, 0.18, 0.4, 1),
        ("MotorTemperature", "Motor Temperature", "°C", 58.0, 1.8, 0.7, 1),
        ("DoorCycleTime", "Door Cycle Time", "s", 4.2, 0.15, 0.2, 1),
    ],
    "HVAC": [
        ("SupplyTemperature", "Supply Air Temperature", "°C", 13.5, 0.5, 0.5, 1),
        ("FanCurrent", "Fan Motor Current", "A", 18.5, 0.7, 0.7, 1),
        ("Airflow", "Airflow", "m³/h", 9800.0, 220.0, 0.6, -1),
        ("ReturnTemperature", "Return Air Temperature", "°C", 23.5, 0.6, 0.8, 1),
    ],
    "Pump": [
        ("FlowRate", "Flow Rate", "L/s", 36.0, 1.1, 0.4, -1),
        ("Pressure", "Discharge Pressure", "kPa", 310.0, 7.0, 0.3, 0),
        ("MotorCurrent", "Motor Current", "A", 27.0, 0.9, 0.5, 1),
        ("Vibration", "Vibration", "mm/s", 1.9, 0.15, 0.3, 1),
    ],
    "Boiler": [
        ("Pressure", "Steam Pressure", "kPa", 205.0, 4.0, 0.3, 0),
        ("WaterTemperature", "Supply Water Temperature", "°C", 79.0, 1.5, 0.5, 0),
        ("FlueTemperature", "Flue Gas Temperature", "°C", 185.0, 4.0, 0.4, 1),
    ],
    "ElectricalPanel": [
        ("LoadCurrent", "Load Current", "A", 240.0, 9.0, 0.9, 1),
        ("PanelTemperature", "Panel Temperature", "°C", 34.0, 1.1, 0.7, 1),
        ("VoltageImbalance", "Voltage Imbalance", "%", 1.2, 0.2, 0.2, 1),
    ],
    "Generator": [
        ("BatteryVoltage", "Starting Battery Voltage", "V", 25.6, 0.15, 0.2, -1),
        ("CoolantTemperature", "Coolant Temperature", "°C", 36.0, 1.0, 0.6, 1),
        ("LoadCurrent", "Test Load Current", "A", 12.0, 0.8, 0.3, 1),
    ],
}

# Scripted degradation profiles — the "interesting" anomalies. Mirrored in IlliniFixDemo.py.
DEGRADATION_PROFILES = {
    # Scenario A — flagship: Grainger Elevator #2 motor/bearing degradation over 72h
    "ast_grainger_elev2": {
        "MotorCurrent": {"driftPct": 0.19, "startHoursBeforeEnd": 72, "shape": 1.4, "noiseMult": 1.3},
        "Vibration": {"driftPct": 0.31, "startHoursBeforeEnd": 72, "shape": 1.3, "noiseMult": 2.0},
        "MotorTemperature": {"driftPct": 0.12, "startHoursBeforeEnd": 72, "shape": 1.6, "noiseMult": 1.0},
        "DoorCycleTime": {"driftPct": 0.08, "startHoursBeforeEnd": 48, "shape": 1.0, "noiseMult": 1.2},
    },
    # Scenario B — CIF HVAC #7 fan motor degradation (supply temp up, fan current up, airflow down)
    "ast_cif_hvac7": {
        "SupplyTemperature": {"driftPct": 0.10, "startHoursBeforeEnd": 48, "shape": 1.3, "noiseMult": 1.2},
        "FanCurrent": {"driftPct": 0.10, "startHoursBeforeEnd": 60, "shape": 1.2, "noiseMult": 1.3},
        "Airflow": {"driftPct": -0.09, "startHoursBeforeEnd": 60, "shape": 1.2, "noiseMult": 1.0},
        "ReturnTemperature": {"driftPct": 0.03, "startHoursBeforeEnd": 48, "shape": 1.0, "noiseMult": 1.0},
    },
    # ARC Pump #3 — slow bearing wear over 5 days
    "ast_arc_pump3": {
        "Vibration": {"driftPct": 0.30, "startHoursBeforeEnd": 120, "shape": 1.1, "noiseMult": 1.6},
        "MotorCurrent": {"driftPct": 0.11, "startHoursBeforeEnd": 120, "shape": 1.0, "noiseMult": 1.1},
        "FlowRate": {"driftPct": -0.12, "startHoursBeforeEnd": 120, "shape": 1.0, "noiseMult": 1.0},
        "Pressure": {"driftPct": -0.05, "startHoursBeforeEnd": 96, "shape": 1.0, "noiseMult": 1.0},
    },
    # ISR Boiler #2 — pressure instability (noise only) + slightly low water temperature, PM overdue
    "ast_isr_boiler2": {
        "Pressure": {"driftPct": 0.0, "startHoursBeforeEnd": 48, "shape": 1.0, "noiseMult": 2.6},
        "WaterTemperature": {"driftPct": -0.045, "startHoursBeforeEnd": 48, "shape": 1.0, "noiseMult": 1.3},
    },
    # ECEB Electrical Panel #4 — panel temperature step in the last 24h
    "ast_eceb_panel4": {
        "PanelTemperature": {"driftPct": 0.075, "startHoursBeforeEnd": 24, "shape": 0.6, "noiseMult": 1.0},
        "LoadCurrent": {"driftPct": 0.03, "startHoursBeforeEnd": 24, "shape": 0.6, "noiseMult": 1.0},
    },
    # ISR Townsend Elevator #1 — door operator wear
    "ast_isr_elev1": {
        "DoorCycleTime": {"driftPct": 0.10, "startHoursBeforeEnd": 96, "shape": 1.0, "noiseMult": 1.5},
    },
    # Siebel HVAC #6 — mild fan degradation
    "ast_siebel_hvac6": {
        "FanCurrent": {"driftPct": 0.14, "startHoursBeforeEnd": 96, "shape": 1.0, "noiseMult": 1.2},
        "Airflow": {"driftPct": -0.08, "startHoursBeforeEnd": 96, "shape": 1.0, "noiseMult": 1.0},
    },
}


def asset(id, name, atype, building, zone, manufacturer, model, installed_years, last_pm_days, next_pm_days,
          criticality, people, access, floors=None):
    return dict(
        id=id, assetName=name, assetType=atype, building=building, zone=zone, manufacturer=manufacturer,
        modelNumber=model, installationDate=days_ago(installed_years * 365.25), lastMaintenanceDate=days_ago(last_pm_days),
        nextScheduledMaintenanceDate=days_ahead(next_pm_days), assetCriticality=criticality,
        estimatedPeopleAffected=people, accessibilityImpact=access, floorsServed=floors, isMonitored=True,
        # rollups — recomputed by IlliniFixRiskEngine; seeded with neutral defaults so the UI never shows blanks
        healthScore=95.0, currentFailureProbability=0.05, priorityScore=10.0, status="Healthy",
    )


ASSETS = [
    # Elevators (6)
    asset("ast_grainger_elev1", "Grainger Elevator #1", "Elevator", "bld_grainger", "zone_grainger_f1", "Otis", "Gen2 Premier", 12, 60, 305, "High", 900, "High", "1-4"),
    asset("ast_grainger_elev2", "Grainger Elevator #2", "Elevator", "bld_grainger", "zone_grainger_f2", "Otis", "Gen2 Premier", 12, 379, -14, "Critical", 1100, "Critical", "1-4"),
    asset("ast_siebel_elev1", "Siebel Elevator #1", "Elevator", "bld_siebel", "zone_siebel_atrium", "ThyssenKrupp", "Evolution 200", 20, 90, 275, "High", 700, "High", "0-4"),
    asset("ast_cif_elev1", "CIF Elevator #1", "Elevator", "bld_cif", "zone_cif_lobby", "KONE", "MonoSpace 500", 3, 45, 320, "High", 1200, "High", "1-4"),
    asset("ast_eceb_elev1", "ECEB Elevator #1", "Elevator", "bld_eceb", "zone_eceb_aud", "KONE", "MonoSpace 500", 10, 120, 245, "High", 800, "High", "0-5"),
    asset("ast_isr_elev1", "ISR Townsend Elevator #1", "Elevator", "bld_isr", "zone_isr_townsend", "Schindler", "3300", 15, 200, 165, "Critical", 500, "Critical", "1-12"),
    # HVAC (8)
    asset("ast_grainger_hvac1", "Grainger HVAC #1 (AHU-1)", "HVAC", "bld_grainger", "zone_grainger_mech", "Trane", "Climate Changer", 9, 30, 150, "Moderate", 1800, "None", None),
    asset("ast_grainger_hvac2", "Grainger HVAC #2 (AHU-2)", "HVAC", "bld_grainger", "zone_grainger_mech", "Trane", "Climate Changer", 9, 75, 105, "Moderate", 900, "None", None),
    asset("ast_siebel_hvac6", "Siebel HVAC #6", "HVAC", "bld_siebel", "zone_siebel_mech", "Carrier", "39M AHU", 18, 150, 30, "Moderate", 700, "None", None),
    asset("ast_cif_hvac7", "CIF HVAC #7", "HVAC", "bld_cif", "zone_cif_mech", "Daikin", "Vision AHU", 3, 95, 85, "High", 1600, "Low", None),
    asset("ast_cif_hvac3", "CIF HVAC #3", "HVAC", "bld_cif", "zone_cif_mech", "Daikin", "Vision AHU", 3, 20, 160, "Moderate", 1200, "None", None),
    asset("ast_eceb_hvac3", "ECEB HVAC #3", "HVAC", "bld_eceb", "zone_eceb_mech", "Trane", "Performance Climate Changer", 10, 110, 70, "Moderate", 900, "None", None),
    asset("ast_arc_hvac1", "ARC HVAC #1", "HVAC", "bld_arc", "zone_arc_mech", "York", "Solution AHU", 16, 40, 140, "Moderate", 2500, "None", None),
    asset("ast_isr_hvac2", "ISR HVAC #2", "HVAC", "bld_isr", "zone_isr_dining", "Carrier", "39M AHU", 11, 65, 115, "Moderate", 1000, "None", None),
    # Pumps (5)
    asset("ast_grainger_pump1", "Grainger Pump #1 (Chilled Water)", "Pump", "bld_grainger", "zone_grainger_mech", "Grundfos", "TP 100-240", 9, 50, 130, "Moderate", 1800, "None", None),
    asset("ast_cif_pump4", "CIF Pump #4 (Condensate)", "Pump", "bld_cif", "zone_cif_mech", "Bell & Gossett", "e-1510", 3, 100, 80, "Low", 400, "None", None),
    asset("ast_arc_pump3", "ARC Pump #3 (Pool Circulation)", "Pump", "bld_arc", "zone_arc_pool", "Pentair", "EQ Series", 8, 190, -10, "High", 600, "Low", None),
    asset("ast_isr_pump1", "ISR Pump #1 (Domestic Water Booster)", "Pump", "bld_isr", "zone_isr_boiler", "Grundfos", "Hydro MPC", 7, 80, 100, "High", 1000, "Moderate", None),
    asset("ast_eceb_pump2", "ECEB Pump #2 (Hot Water)", "Pump", "bld_eceb", "zone_eceb_mech", "Armstrong", "4300", 10, 35, 145, "Low", 500, "None", None),
    # Boilers (4)
    asset("ast_isr_boiler1", "ISR Boiler #1", "Boiler", "bld_isr", "zone_isr_boiler", "Cleaver-Brooks", "CBEX Elite", 14, 70, 110, "High", 1000, "Moderate", None),
    asset("ast_isr_boiler2", "ISR Boiler #2", "Boiler", "bld_isr", "zone_isr_boiler", "Cleaver-Brooks", "CBEX Elite", 14, 395, -30, "Critical", 1000, "Moderate", None),
    asset("ast_arc_boiler1", "ARC Boiler #1 (Pool Heating)", "Boiler", "bld_arc", "zone_arc_mech", "Lochinvar", "Crest FBN", 8, 55, 125, "Moderate", 600, "None", None),
    asset("ast_siebel_boiler1", "Siebel Boiler #1", "Boiler", "bld_siebel", "zone_siebel_mech", "Aerco", "Benchmark 3000", 18, 410, -45, "Moderate", 900, "None", None),
    # Electrical / mechanical (7)
    asset("ast_grainger_panel1", "Grainger Electrical Panel MDP-1", "ElectricalPanel", "bld_grainger", "zone_grainger_mech", "Square D", "QED-2", 12, 180, 185, "Critical", 6500, "Low", None),
    asset("ast_siebel_panel2", "Siebel Electrical Panel #2", "ElectricalPanel", "bld_siebel", "zone_siebel_mech", "Eaton", "Pow-R-Line", 20, 160, 205, "High", 3200, "Low", None),
    asset("ast_cif_panel1", "CIF Electrical Panel #1", "ElectricalPanel", "bld_cif", "zone_cif_mech", "Siemens", "P4 Panelboard", 3, 140, 225, "High", 4800, "Low", None),
    asset("ast_eceb_panel4", "ECEB Electrical Panel #4 (East Wing)", "ElectricalPanel", "bld_eceb", "zone_eceb_east", "Eaton", "Pow-R-Line", 10, 220, 145, "High", 800, "Low", None),
    asset("ast_arc_panel1", "ARC Electrical Panel #1", "ElectricalPanel", "bld_arc", "zone_arc_mech", "Square D", "I-Line", 16, 130, 235, "High", 7000, "Low", None),
    asset("ast_isr_panel3", "ISR Electrical Panel #3", "ElectricalPanel", "bld_isr", "zone_isr_boiler", "Siemens", "P4 Panelboard", 15, 170, 195, "High", 1400, "Low", None),
    asset("ast_eceb_gen1", "ECEB Generator #1", "Generator", "bld_eceb", "zone_eceb_mech", "Caterpillar", "C15 500kW", 10, 25, 5, "High", 3900, "Low", None),
]

ZONE_BY_ID = {z["id"]: z for z in ZONES}
ASSET_BY_ID = {a["id"]: a for a in ASSETS}


def build_sensors():
    sensors = []
    for a in ASSETS:
        for (stype, dname, unit, mean, sd, amp, bad) in SENSOR_TEMPLATES[a["assetType"]]:
            sid = f"sen_{a['id'][4:]}_{stype.lower()}"
            sensors.append(dict(
                id=sid, name=dname, asset=a["id"], sensorType=stype, unit=unit,
                normalMin=round(mean - 3 * sd, 4), normalMax=round(mean + 3 * sd, 4),
                baselineMean=mean, baselineStdDev=sd, diurnalAmplitude=amp, badDirection=bad,
            ))
    return sensors


def build_readings(sensors):
    """Returns {assetId: [reading rows]} — chunked per asset for manageable files."""
    by_asset = {}
    start = NOW - dt.timedelta(hours=HOURS - 1)
    for s in sensors:
        profile = DEGRADATION_PROFILES.get(s["asset"], {}).get(s["sensorType"])
        rows = by_asset.setdefault(s["asset"], [])
        for idx in range(HOURS):
            t = start + dt.timedelta(hours=idx)
            v = reading_value(s["id"], s["baselineMean"], s["baselineStdDev"], s["diurnalAmplitude"], idx, t.hour, profile)
            z = abs(v - s["baselineMean"]) / s["baselineStdDev"]
            rows.append(dict(
                id=f"sr_{s['id'][4:]}_{idx:03d}", sensor=s["id"], timestamp=iso(t), value=round(v, 4),
                anomalyScore=round(z, 3), isAnomaly=bool(z > 2.5),
            ))
    return by_asset


def build_reports():
    R = []

    def rep(i, building, zone, text, hours, category, severity, reporter="Student", status="New", emergency=False):
        R.append(dict(
            id=f"rpt_{i:03d}", timestamp=hours_ago(hours), building=building, zone=zone, asset=None,
            description=text, imageUrl=None, category=category, severity=severity, status=status,
            reporterType=reporter, emergencyFlag=emergency, isDemoGenerated=False,
        ))

    # Scenario A — Grainger Elevator #2 (human sensors)
    rep(1, "bld_grainger", "zone_grainger_f2", "The elevator shook when it stopped on floor 3.", 40, "Elevator", "Medium")
    rep(2, "bld_grainger", "zone_grainger_f1", "Elevator is making a grinding noise.", 26, "Elevator", "High")
    rep(3, "bld_grainger", None, "Something feels wrong with the north elevator.", 9, "Elevator", "Medium", "Staff")
    # Scenario B — CIF HVAC #7
    rep(4, "bld_cif", "zone_cif_lecture", "Room 2039 is really hot.", 30, "HVAC", "Medium")
    rep(5, "bld_cif", "zone_cif_lecture", "AC doesn't seem to be working on the second floor.", 20, "HVAC", "Medium")
    rep(6, "bld_cif", "zone_cif_lecture", "Lecture hall on 2 has been stuffy and warm all afternoon.", 6, "HVAC", "Medium", "Faculty")
    # Scenario C — CIF water leak duplicates
    rep(7, "bld_cif", "zone_cif_lecture", "Water dripping from ceiling near CIF 2039.", 14, "Plumbing", "High")
    rep(8, "bld_cif", "zone_cif_lecture", "Leak outside classroom 2039.", 12, "Plumbing", "High")
    rep(9, "bld_cif", None, "Ceiling leaking on second floor CIF.", 11, "Plumbing", "High", "Staff")
    # Background reports
    rep(10, "bld_siebel", "zone_siebel_atrium", "Lights flickering in the atrium near the stairs.", 50, "Lighting", "Low")
    rep(11, "bld_siebel", "zone_siebel_labs", "Outlet by the 2nd floor lab benches isn't working.", 70, "Electrical", "Low")
    rep(12, "bld_eceb", "zone_eceb_east", "Room 2013 has been freezing cold all week.", 90, "HVAC", "Medium")
    rep(13, "bld_eceb", "zone_eceb_east", "Hallway lights out on the east wing second floor.", 100, "Lighting", "Low")
    rep(14, "bld_arc", "zone_arc_pool", "Pool pump room is making a loud rattling noise.", 36, "General", "Medium", "Staff")
    rep(15, "bld_arc", "zone_arc_pool", "Drain by the pool deck is backed up and water pooling.", 60, "Plumbing", "Medium", "Staff", "InProgress")
    rep(16, "bld_arc", "zone_arc_gym", "Treadmill area is way too warm, AC isn't keeping up.", 48, "HVAC", "Low")
    rep(17, "bld_isr", "zone_isr_townsend", "No hot water in Townsend showers this morning.", 14, "Plumbing", "High")
    rep(18, "bld_isr", "zone_isr_townsend", "Hot water keeps going lukewarm on floor 5.", 8, "Plumbing", "Medium")
    rep(19, "bld_isr", "zone_isr_townsend", "Townsend elevator doors take forever to close and reopen randomly.", 30, "Elevator", "Medium")
    rep(20, "bld_isr", "zone_isr_townsend", "Elevator doors stuck open for a minute on floor 4.", 5, "Elevator", "Medium")
    rep(21, "bld_grainger", "zone_grainger_f1", "Water fountain on floor 1 leaking onto the floor.", 120, "Plumbing", "Low")
    rep(22, "bld_grainger", "zone_grainger_f4", "Floor 4 quiet study is too cold.", 72, "HVAC", "Low")
    rep(23, "bld_cif", "zone_cif_lobby", "Automatic door at the main entrance isn't opening.", 80, "General", "Medium")
    rep(24, "bld_cif", "zone_cif_lobby", "Cracked tile at the bottom of the main stairs — trip hazard.", 110, "Structural", "Medium", "Staff")
    rep(25, "bld_siebel", "zone_siebel_atrium", "Elevator seems slow but working.", 130, "Elevator", "Low")
    rep(26, "bld_eceb", "zone_eceb_east", "Burning smell on the east wing second floor near the electrical closet.", 3, "Electrical", "Critical", "Staff", "New", True)
    rep(27, "bld_arc", "zone_arc_gym", "Light out in the women's locker room.", 150, "Lighting", "Low", "Student", "Resolved")
    rep(28, "bld_isr", "zone_isr_dining", "Dining hall exhaust fan is super loud.", 96, "HVAC", "Low", "Staff")
    rep(29, "bld_grainger", "zone_grainger_f1", "Elevator #1 button for floor 3 doesn't light up.", 160, "Elevator", "Low", "Student", "Resolved")
    rep(30, "bld_siebel", "zone_siebel_mech", "Basement smells musty, maybe a leak?", 55, "Plumbing", "Low", "Staff")
    rep(31, "bld_eceb", "zone_eceb_aud", "Auditorium projector area very hot, vent blowing warm air.", 44, "HVAC", "Medium", "Faculty")
    rep(32, "bld_cif", "zone_cif_lecture", "Second floor restroom faucet won't shut off.", 33, "Plumbing", "Low")
    rep(33, "bld_arc", "zone_arc_gym", "Sauna heater not working.", 140, "Electrical", "Low")
    rep(34, "bld_isr", "zone_isr_dining", "Lobby doors slam shut hard — closer is broken.", 125, "General", "Low")
    return R


def build_history():
    H = []
    counter = {}

    def hist(asset_id, days, mtype, failure_mode, desc, downtime, duration, cost):
        n = counter.get(asset_id, 0) + 1
        counter[asset_id] = n
        H.append(dict(id=f"mh_{asset_id[4:]}_{n:02d}", asset=asset_id, serviceDate=days_ago(days), maintenanceType=mtype,
                      failureMode=failure_mode, description=desc, downtimeHours=downtime, repairDurationHours=duration, cost=cost))

    # Key histories supporting the scenarios
    hist("ast_grainger_elev2", 182, "Corrective", "Motor/bearing degradation", "Replaced hoist motor bearing after vibration and grinding noise reports; realigned sheave.", 30, 9, 8400)
    hist("ast_grainger_elev2", 379, "Preventive", None, "Annual elevator inspection and lubrication.", 4, 3, 1200)
    hist("ast_grainger_elev2", 560, "Corrective", "Door operator wear", "Adjusted door operator and replaced rollers.", 6, 3, 1900)
    hist("ast_cif_hvac7", 425, "Corrective", "Fan motor degradation", "Fan motor replaced after rising current draw and bearing failure.", 18, 7, 6100)
    hist("ast_cif_hvac7", 95, "Preventive", None, "Quarterly filter change and belt inspection.", 1, 1.5, 350)
    hist("ast_arc_pump3", 270, "Corrective", "Bearing wear / impeller imbalance", "Replaced pump shaft seal and bearing after vibration alarm.", 14, 6, 3300)
    hist("ast_arc_pump3", 190, "Preventive", None, "Pool circulation pump service and strainer cleaning.", 2, 2, 450)
    hist("ast_isr_boiler2", 395, "Inspection", None, "Annual boiler inspection (state inspection).", 6, 5, 2200)
    hist("ast_isr_boiler2", 700, "Corrective", "Pressure control / relief valve instability", "Replaced operating pressure control and relief valve.", 20, 8, 4100)
    hist("ast_isr_elev1", 200, "Preventive", None, "Elevator PM — door operator adjustment.", 3, 2.5, 900)
    hist("ast_isr_elev1", 610, "Corrective", "Door operator wear", "Door operator motor replaced.", 10, 5, 3500)
    hist("ast_siebel_hvac6", 150, "Preventive", None, "AHU belt replacement and bearing lubrication.", 2, 2, 400)
    hist("ast_siebel_hvac6", 720, "Corrective", "Fan motor degradation", "Fan motor bearings replaced.", 12, 6, 2800)
    hist("ast_eceb_panel4", 220, "Inspection", None, "Infrared thermal scan — no hot spots found.", 0, 1.5, 600)
    hist("ast_siebel_boiler1", 410, "Preventive", None, "Annual burner tune and combustion analysis.", 5, 4, 1500)
    hist("ast_eceb_gen1", 25, "Preventive", None, "Monthly load bank test and fluid check.", 1, 1.5, 300)
    # Generic preventive records for the rest
    generic = {
        "Elevator": ("Annual elevator inspection and lubrication.", 4, 3, 1200),
        "HVAC": ("Quarterly filter change, belt and coil inspection.", 1, 1.5, 350),
        "Pump": ("Pump service: seal check, strainer cleaning, alignment.", 2, 2, 450),
        "Boiler": ("Annual boiler inspection and burner tune.", 5, 4, 1500),
        "ElectricalPanel": ("Infrared thermal scan and torque check.", 0, 1.5, 600),
        "Generator": ("Monthly load bank test and fluid check.", 1, 1.5, 300),
    }
    for a in ASSETS:
        if a["id"] in counter:
            continue
        desc, dt_h, dur, cost = generic[a["assetType"]]
        last = (NOW - dt.datetime.fromisoformat(a["lastMaintenanceDate"].replace("Z", "+00:00"))).days
        hist(a["id"], last, "Preventive", None, desc, dt_h, dur, cost)
        hist(a["id"], last + 365, "Preventive", None, desc, dt_h, dur, cost)
    return H


CREWS = [
    dict(id="crew_alpha", name="Crew Alpha", skills=["Mechanical", "Elevator"], currentBuilding="bld_grainger", shiftStart="08:00", shiftEnd="16:00", availableHours=8.0, status="Available", crewSize=2, leadName="M. Okafor"),
    dict(id="crew_bravo", name="Crew Bravo", skills=["HVAC", "Mechanical"], currentBuilding="bld_cif", shiftStart="08:00", shiftEnd="16:00", availableHours=8.0, status="Available", crewSize=2, leadName="J. Hernandez"),
    dict(id="crew_charlie", name="Crew Charlie", skills=["Electrical", "General"], currentBuilding="bld_eceb", shiftStart="08:00", shiftEnd="16:00", availableHours=8.0, status="Available", crewSize=2, leadName="S. Patel"),
    dict(id="crew_delta", name="Crew Delta", skills=["Plumbing", "General"], currentBuilding="bld_isr", shiftStart="08:00", shiftEnd="16:00", availableHours=8.0, status="Available", crewSize=2, leadName="D. Nguyen"),
]


def build_work_orders():
    W = []

    def wo(i, asset_id, building, title, desc, priority, status, skill, minutes, hours_old, source, crew=None, pscore=None, rr=0.0, report=None):
        W.append(dict(
            id=f"wo_{i:04d}", asset=asset_id, building=building, title=title, description=desc, priority=priority,
            status=status, requiredSkill=skill, estimatedDuration=minutes, createdAt=hours_ago(hours_old),
            assignedCrew=crew, source=source, priorityScore=pscore, expectedRiskReduction=rr, relatedReport=report,
            isDemoGenerated=False,
        ))

    wo(1, None, "bld_siebel", "Replace flickering atrium lighting ballast", "Reports of flickering lights near the atrium stairs; replace ballast and inspect wiring.", "Low", "Assigned", "Electrical", 60, 46, "StudentReport", "crew_charlie", 28, 0.0, "rpt_010")
    wo(2, "ast_grainger_hvac1", "bld_grainger", "Quarterly PM — Grainger HVAC #1", "Filter change, belt inspection, coil cleaning.", "Low", "Scheduled", "HVAC", 90, 120, "PreventiveMaintenance", None, 22)
    wo(3, "ast_arc_pump3", "bld_arc", "Inspect ARC Pump #3 vibration trend", "Vibration and motor current trending up over 5 days; inspect bearings and impeller.", "High", "Draft", "Mechanical", 60, 20, "PredictedFailure", None, 52, 0.45)
    wo(4, None, "bld_cif", "Investigate ceiling leak near CIF 2039", "Three reports of water dripping from the ceiling on the second floor; locate source (chilled water / condensate line).", "High", "Draft", "Plumbing", 90, 10, "StudentReport", None, 61, 0.0, "rpt_007")
    wo(5, "ast_isr_boiler2", "bld_isr", "ISR Boiler #2 overdue annual inspection", "Annual inspection is 30 days overdue; pressure fluctuation observed.", "High", "Draft", "Mechanical", 240, 72, "PreventiveMaintenance", None, 47, 0.3)
    wo(6, "ast_eceb_panel4", "bld_eceb", "Thermal scan — ECEB Panel #4 (East Wing)", "Panel temperature stepped up in the last 24h; perform infrared scan and torque check.", "Medium", "Draft", "Electrical", 45, 8, "PredictedFailure", None, 33, 0.2)
    wo(7, "ast_isr_hvac2", "bld_isr", "ISR HVAC #2 filter replacement", "Scheduled filter replacement.", "Low", "Scheduled", "HVAC", 45, 150, "PreventiveMaintenance", None, 15)
    wo(8, "ast_siebel_hvac6", "bld_siebel", "Siebel HVAC #6 fan inspection", "Fan current rising and airflow declining; inspect fan bearings and belt tension.", "Medium", "Draft", "HVAC", 75, 16, "PredictedFailure", None, 40, 0.35)
    wo(9, "ast_cif_pump4", "bld_cif", "CIF Pump #4 condensate pump check", "Check float switch and discharge line.", "Low", "Draft", "Mechanical", 30, 200, "Manual", None, 12)
    wo(10, "ast_eceb_hvac3", "bld_eceb", "ECEB HVAC #3 thermostat calibration (Room 2013 cold)", "Zone reported freezing all week; calibrate thermostat and check VAV damper.", "Medium", "Draft", "HVAC", 60, 88, "StudentReport", None, 26, 0.0, "rpt_012")
    wo(11, None, "bld_arc", "Clear pool deck drain backup", "Standing water near pool deck drain.", "Medium", "InProgress", "Plumbing", 60, 58, "StudentReport", "crew_delta", 30, 0.0, "rpt_015")
    wo(12, "ast_isr_elev1", "bld_isr", "ISR Townsend Elevator #1 door operator service", "Door cycle time increasing; reports of doors reopening randomly.", "Medium", "Draft", "Elevator", 90, 28, "PredictedFailure", None, 44, 0.4)
    wo(13, "ast_grainger_elev1", "bld_grainger", "Grainger Elevator #1 annual inspection", "Annual state inspection.", "Low", "Scheduled", "Elevator", 180, 240, "PreventiveMaintenance", None, 18)
    wo(14, "ast_eceb_gen1", "bld_eceb", "ECEB Generator #1 monthly load test", "Monthly load bank test and fluid check.", "Low", "Scheduled", "Electrical", 90, 100, "PreventiveMaintenance", None, 16)
    wo(15, "ast_siebel_boiler1", "bld_siebel", "Siebel Boiler #1 overdue PM and relief valve test", "Annual PM is 45 days overdue.", "Medium", "Draft", "Mechanical", 180, 300, "PreventiveMaintenance", None, 31, 0.15)
    wo(16, "ast_arc_boiler1", "bld_arc", "ARC Boiler #1 burner tune", "Seasonal burner tune and combustion analysis.", "Low", "Draft", "Mechanical", 120, 170, "PreventiveMaintenance", None, 14)
    wo(17, "ast_cif_panel1", "bld_cif", "CIF Electrical Panel #1 breaker replacement", "Replace nuisance-tripping breaker feeding lecture wing lighting.", "Medium", "Draft", "Electrical", 60, 130, "Manual", None, 24)
    wo(18, None, "bld_eceb", "East wing hallway lights out", "Replace failed LED drivers in east wing second floor hallway.", "Low", "Draft", "Electrical", 45, 98, "StudentReport", None, 17, 0.0, "rpt_013")
    wo(19, None, "bld_arc", "Locker room light replacement", "Replaced failed fixture.", "Low", "Completed", "Electrical", 30, 148, "StudentReport", "crew_charlie", 10, 0.0, "rpt_027")
    wo(20, "ast_grainger_elev1", "bld_grainger", "Grainger Elevator #1 floor 3 button repair", "Replaced call button lamp.", "Low", "Completed", "Elevator", 30, 158, "StudentReport", "crew_alpha", 12, 0.0, "rpt_029")
    wo(21, None, "bld_isr", "ISR Townsend showers — no hot water", "Investigate hot water supply; check recirculation pump and boiler output.", "High", "Draft", "Plumbing", 90, 12, "StudentReport", None, 45, 0.0, "rpt_017")
    return W


def write_rows(type_name, filename, rows):
    folder = os.path.join(DATA, type_name)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, filename), "w", encoding="utf-8") as f:
        json.dump(rows, f, indent=1, ensure_ascii=False)
    return len(rows)


def main():
    counts = {}
    counts["CampusBuilding"] = write_rows("CampusBuilding", "buildings.json", BUILDINGS)
    counts["CampusZone"] = write_rows("CampusZone", "zones.json", ZONES)
    counts["MaintenanceAsset"] = write_rows("MaintenanceAsset", "assets.json", ASSETS)
    sensors = build_sensors()
    counts["Sensor"] = write_rows("Sensor", "sensors.json", sensors)
    readings = build_readings(sensors)
    total = 0
    # remove stale reading files first so re-runs stay clean
    folder = os.path.join(DATA, "SensorReading")
    if os.path.isdir(folder):
        for fn in os.listdir(folder):
            os.remove(os.path.join(folder, fn))
    for asset_id, rows in readings.items():
        total += write_rows("SensorReading", f"readings_{asset_id[4:]}.json", rows)
    counts["SensorReading"] = total
    counts["StudentReport"] = write_rows("StudentReport", "reports.json", build_reports())
    counts["MaintenanceHistory"] = write_rows("MaintenanceHistory", "history.json", build_history())
    counts["MaintenanceCrew"] = write_rows("MaintenanceCrew", "crews.json", CREWS)
    counts["WorkOrder"] = write_rows("WorkOrder", "work_orders.json", build_work_orders())
    print(json.dumps({"generatedAt": iso(NOW), "counts": counts}, indent=2))


if __name__ == "__main__":
    main()
