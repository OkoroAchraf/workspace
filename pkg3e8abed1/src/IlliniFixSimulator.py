CRIT_W = {"Low": 0.25, "Moderate": 0.5, "High": 0.75, "Critical": 1.0}
DEFAULT_DOWNTIME_H = {"Elevator": 36, "HVAC": 24, "Pump": 12, "Boiler": 30, "ElectricalPanel": 10, "Generator": 8}


def _status_for_health(h):
    if h >= 90:
        return "Healthy"
    if h >= 75:
        return "Monitor"
    if h >= 50:
        return "Warning"
    return "Critical"


def _load_assets():
    return list(c3.MaintenanceAsset.fetch(include="this, building.id, building.shortName, building.name, building.estimatedDailyOccupancy, zone.id, zone.name", limit=-1).objs or [])


def _building_health(group, overrides):
    ws, hs = [], []
    for a in group:
        h = overrides.get(a.id, float(a.healthScore if a.healthScore is not None else 95.0))
        ws.append(CRIT_W.get(a.assetCriticality, 0.5))
        hs.append(h)
    if not hs:
        return 100.0
    return round(0.6 * (sum(w * h for w, h in zip(ws, hs)) / sum(ws)) + 0.4 * min(hs), 1)


def _campus_kpis(assets, health_overrides=None, prob_overrides=None):
    health_overrides = health_overrides or {}
    prob_overrides = prob_overrides or {}
    by_b = {}
    for a in assets:
        if a.building:
            by_b.setdefault(a.building.id, []).append(a)
    num, den = 0.0, 0.0
    building_health = {}
    for bid, group in by_b.items():
        bh = _building_health(group, health_overrides)
        building_health[bid] = bh
        occ = float(group[0].building.estimatedDailyOccupancy or 1)
        num += bh * occ
        den += occ
    critical = 0
    predicted = 0
    people = 0
    for a in assets:
        h = health_overrides.get(a.id, float(a.healthScore if a.healthScore is not None else 95.0))
        p = prob_overrides.get(a.id, float(a.currentFailureProbability or 0.0))
        if _status_for_health(h) == "Critical":
            critical += 1
        if p >= 0.5:
            predicted += 1
            people += int(a.estimatedPeopleAffected or 0)
    return {"campusHealth": round(num / den, 1) if den else 100.0, "criticalAssets": critical, "predictedFailures": predicted,
            "peopleAtRisk": people, "buildingHealth": building_health}


def _current(asset_id, type_name):
    rows = list(getattr(c3, type_name).fetch(filter=c3.Filter.eq("asset.id", asset_id).and_(c3.Filter.eq("isCurrent", True)), include="this", limit=1).objs or [])
    return rows[0] if rows else None


def simulateAssetFailure(cls, assetId):
    assets = _load_assets()
    target = [a for a in assets if a.id == assetId]
    if not target:
        raise ValueError("Unknown asset " + str(assetId))
    asset = target[0]
    pred = _current(assetId, "FailurePrediction")
    now = c3.DateTime.now()
    before = _campus_kpis(assets)
    after = _campus_kpis(assets, {assetId: 0.0}, {assetId: 1.0})
    siblings = [a for a in assets if a.id != assetId and a.building and asset.building and a.building.id == asset.building.id and a.assetType == asset.assetType]
    alt_pct = None
    if siblings:
        base = 37 if asset.assetType == "Elevator" else 30
        alt_pct = int(round(base * (1.0 / len(siblings)) * (1.0 if len(siblings) == 1 else 1.4)))
    access = asset.accessibilityImpact or "None"
    impact_level = "HIGH" if access in ("High", "Critical") else ("MODERATE" if access == "Moderate" else "LOW")
    history = list(c3.MaintenanceHistory.fetch(filter=c3.Filter.eq("asset.id", assetId), include="downtimeHours, maintenanceType", limit=-1).objs or [])
    corrective = [float(h.downtimeHours) for h in history if h.maintenanceType in ("Corrective", "Emergency", "Replacement") and h.downtimeHours]
    downtime = round(sum(corrective) / len(corrective), 1) if corrective else DEFAULT_DOWNTIME_H.get(asset.assetType, 12)
    people = int(asset.estimatedPeopleAffected or 0)
    result = {
        "assetId": assetId, "assetName": asset.assetName, "assetType": asset.assetType,
        "buildingId": asset.building.id if asset.building else None, "buildingName": asset.building.name if asset.building else None,
        "buildingShortName": asset.building.shortName if asset.building else None, "zoneName": asset.zone.name if asset.zone else None,
        "before": {"status": asset.status, "failureProbability": float(pred.failureProbability) if pred else float(asset.currentFailureProbability or 0.0),
                   "assetHealth": asset.healthScore, "buildingHealth": before["buildingHealth"].get(asset.building.id) if asset.building else None,
                   "campusHealth": before["campusHealth"], "criticalAssets": before["criticalAssets"], "peopleAtRisk": before["peopleAtRisk"]},
        "after": {"status": "Offline", "failureProbability": 1.0, "assetHealth": 0.0,
                  "buildingHealth": after["buildingHealth"].get(asset.building.id) if asset.building else None,
                  "campusHealth": after["campusHealth"], "criticalAssets": after["criticalAssets"], "peopleAtRisk": after["peopleAtRisk"]},
        "impacts": {"peopleAffected": people, "accessibilityImpact": access, "impactLevel": impact_level,
                    "alternativeUtilizationIncreasePct": alt_pct, "alternativesCount": len(siblings),
                    "alternativeNames": [s.assetName for s in siblings], "impactedFloors": asset.floorsServed,
                    "estimatedDowntimeHours": downtime, "maintenancePriority": "CRITICAL",
                    "requiresAccessibleRoute": bool(asset.zone and asset.zone.requiresAccessibleRoute) if asset.zone else None},
        "generatedAt": str(now), "scenarioType": "AssetFailure",
    }
    headline = "{} OFFLINE — {:,} daily users affected, accessibility impact {}".format(asset.assetName.upper(), people, impact_level)
    scenario = c3.SimulationScenario.make({"id": "sim_fail_{}_{}".format(assetId[4:], int(now.millis)), "asset": {"id": assetId}, "scenarioType": "AssetFailure",
                                           "parameters": {"assetId": assetId, "alternativeLoadModel": "proportional-redistribution"},
                                           "createdAt": now, "resultSummary": result, "headline": headline}).create()
    result["scenarioId"] = scenario.id if hasattr(scenario, "id") else None
    result["headline"] = headline
    return result


def simulateRepair(cls, assetId):
    assets = _load_assets()
    target = [a for a in assets if a.id == assetId]
    if not target:
        raise ValueError("Unknown asset " + str(assetId))
    asset = target[0]
    pred = _current(assetId, "FailurePrediction")
    rec = _current(assetId, "MaintenanceRecommendation")
    now = c3.DateTime.now()
    p_before = float(pred.failureProbability) if pred else float(asset.currentFailureProbability or 0.0)
    p_after = float(rec.projectedFailureProbability) if rec and rec.projectedFailureProbability is not None else round(p_before * 0.32, 3)
    h_before = float(asset.healthScore if asset.healthScore is not None else 95.0)
    h_after = round(min(100.0, h_before + (p_before - p_after) * 60.0 + 10.0), 1)
    before = _campus_kpis(assets)
    after = _campus_kpis(assets, {assetId: h_after}, {assetId: p_after})
    result = {
        "assetId": assetId, "assetName": asset.assetName, "buildingName": asset.building.name if asset.building else None,
        "buildingShortName": asset.building.shortName if asset.building else None,
        "before": {"campusHealth": before["campusHealth"], "criticalAssets": before["criticalAssets"], "peopleAtRisk": before["peopleAtRisk"],
                   "failureProbability": round(p_before, 3), "assetHealth": round(h_before, 1), "assetStatus": _status_for_health(h_before),
                   "buildingHealth": before["buildingHealth"].get(asset.building.id) if asset.building else None},
        "after": {"campusHealth": after["campusHealth"], "criticalAssets": after["criticalAssets"], "peopleAtRisk": after["peopleAtRisk"],
                  "failureProbability": round(p_after, 3), "assetHealth": h_after, "assetStatus": _status_for_health(h_after),
                  "buildingHealth": after["buildingHealth"].get(asset.building.id) if asset.building else None},
        "deltas": {"campusHealth": round(after["campusHealth"] - before["campusHealth"], 1),
                   "criticalAssets": after["criticalAssets"] - before["criticalAssets"],
                   "peopleAtRisk": after["peopleAtRisk"] - before["peopleAtRisk"],
                   "failureProbability": round(p_after - p_before, 3)},
        "recommendedAction": rec.recommendedAction if rec else None,
        "estimatedInspectionDuration": rec.estimatedInspectionDuration if rec else None,
        "generatedAt": str(now), "scenarioType": "AssetRepair",
    }
    headline = "Repair {}: campus health {} → {}, critical assets {} → {}".format(asset.assetName, before["campusHealth"], after["campusHealth"], before["criticalAssets"], after["criticalAssets"])
    scenario = c3.SimulationScenario.make({"id": "sim_repair_{}_{}".format(assetId[4:], int(now.millis)), "asset": {"id": assetId}, "scenarioType": "AssetRepair",
                                           "parameters": {"assetId": assetId, "projectedFailureProbability": p_after},
                                           "createdAt": now, "resultSummary": result, "headline": headline}).create()
    result["scenarioId"] = scenario.id if hasattr(scenario, "id") else None
    result["headline"] = headline
    return result


def listScenarios(cls):
    rows = list(c3.SimulationScenario.fetch(include="this, asset.id, asset.assetName, asset.building.shortName", order="descending(createdAt)", limit=100).objs or [])
    return [{"id": r.id, "scenarioType": r.scenarioType, "headline": r.headline, "createdAt": str(r.createdAt),
             "assetId": r.asset.id if r.asset else None, "assetName": r.asset.assetName if r.asset else None,
             "buildingShortName": r.asset.building.shortName if r.asset and r.asset.building else None,
             "resultSummary": r.resultSummary} for r in rows]
