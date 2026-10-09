import math

METHOD = "greedy-risk-reduction-per-hour-v1"
WALK_M_PER_MIN = 80.0      # campus walking pace with a cart (~1.3 m/s)
SETUP_MIN = 5              # fixed arrival / setup overhead per job
SAME_BUILDING_BONUS = 1.1  # mild preference for staying in the same building
SCHEDULABLE = ("Draft", "Scheduled")
CRIT_W = {"Low": 0.25, "Moderate": 0.5, "High": 0.75, "Critical": 1.0}


def _clamp(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def _haversine_m(lat1, lon1, lat2, lon2):
    if None in (lat1, lon1, lat2, lon2):
        return 400.0
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _travel_minutes(b_from, b_to):
    if b_from is None or b_to is None:
        return SETUP_MIN + 10
    if b_from.id == b_to.id:
        return SETUP_MIN
    dist = _haversine_m(b_from.latitude, b_from.longitude, b_to.latitude, b_to.longitude)
    return int(round(SETUP_MIN + dist / WALK_M_PER_MIN))


def _label(minutes_from_midnight):
    h = int(minutes_from_midnight // 60) % 24
    m = int(minutes_from_midnight % 60)
    return "{:02d}:{:02d}".format(h, m)


def _parse_hhmm(s, default=8 * 60):
    try:
        hh, mm = str(s).split(":")
        return int(hh) * 60 + int(mm)
    except Exception:
        return default


def _status_for_health(h):
    if h >= 90:
        return "Healthy"
    if h >= 75:
        return "Monitor"
    if h >= 50:
        return "Warning"
    return "Critical"


def _campus_projection(assets_by_id, repaired):
    """Projected campus health / critical count after repairing the given asset ids (same formulas as the risk engine)."""
    buildings = list(c3.CampusBuilding.fetch(include="id, estimatedDailyOccupancy", limit=-1).objs or [])
    by_b = {}
    for a in assets_by_id.values():
        if a.building:
            by_b.setdefault(a.building.id, []).append(a)
    num, den = 0.0, 0.0
    critical = 0
    for b in buildings:
        group = by_b.get(b.id, [])
        if group:
            ws, hs = [], []
            for a in group:
                h = float(a.healthScore if a.healthScore is not None else 95.0)
                p = float(a.currentFailureProbability or 0.0)
                if a.id in repaired:
                    rr = repaired[a.id]
                    h = min(100.0, h + rr * 60.0 + 10.0)
                    p = max(0.0, p - rr)
                if _status_for_health(h) == "Critical" or a.status in ("Offline",):
                    critical += 1
                ws.append(CRIT_W.get(a.assetCriticality, 0.5))
                hs.append(h)
            bh = 0.6 * (sum(w * h for w, h in zip(ws, hs)) / sum(ws)) + 0.4 * min(hs)
        else:
            bh = 100.0
        occ = float(b.estimatedDailyOccupancy or 1)
        num += bh * occ
        den += occ
    return (round(num / den, 1) if den else 100.0), critical


def _wo_row(wo):
    return {
        "workOrderId": wo.id, "title": wo.title, "priority": wo.priority, "requiredSkill": wo.requiredSkill,
        "estimatedDuration": wo.estimatedDuration or 60, "priorityScore": wo.priorityScore or 0.0,
        "expectedRiskReduction": wo.expectedRiskReduction or 0.0, "source": wo.source,
        "assetId": wo.asset.id if wo.asset else None, "assetName": wo.asset.assetName if wo.asset else None,
        "buildingId": wo.building.id if wo.building else None, "buildingName": wo.building.shortName if wo.building else None,
    }


def _remove_where(type_, filter_str):
    """removeAll requires a RemoveAllSpec and an explicit confirmation flag."""
    return type_.removeAll(c3.RemoveAllSpec.make({"filter": filter_str}), True)


def clearPlan(cls):
    plans = list(c3.MaintenancePlan.fetch(include="id", limit=-1).objs or [])
    assignments = list(c3.CrewAssignment.fetch(include="id, workOrder.id, crew.id", limit=-1).objs or [])
    wo_ids = set(a.workOrder.id for a in assignments if a.workOrder)
    if assignments:
        _remove_where(c3.CrewAssignment, "id != '__none__'")
    if plans:
        _remove_where(c3.MaintenancePlan, "id != '__none__'")
    # planner-scheduled work orders go back to Draft without a crew
    wos = list(c3.WorkOrder.fetch(filter=c3.Filter.eq("status", "Scheduled"), include="id, assignedCrew.id", limit=-1).objs or [])
    resets = []
    for wo in wos:
        if wo.id in wo_ids or (wo.assignedCrew and wo.assignedCrew.id):
            resets.append(c3.WorkOrder.make({"id": wo.id, "status": "Draft", "assignedCrew": None}))
    if resets:
        c3.WorkOrder.mergeBatch(resets)
    crews = list(c3.MaintenanceCrew.fetch(include="id, status, availableHours, shiftStart, shiftEnd", limit=-1).objs or [])
    if crews:
        c3.MaintenanceCrew.mergeBatch([c3.MaintenanceCrew.make({"id": c.id, "status": "Available", "availableHours": 8.0}) for c in crews])
    return {"cleared": True, "plansRemoved": len(plans), "assignmentsRemoved": len(assignments), "workOrdersReset": len(resets)}


def getCurrentPlan(cls):
    plans = list(c3.MaintenancePlan.fetch(filter=c3.Filter.eq("isCurrent", True), include="this", order="descending(createdAt)", limit=1).objs or [])
    if not plans:
        return None
    p = plans[0]
    summary = dict(p.summary or {})
    summary["planId"] = p.id
    summary["createdAt"] = str(p.createdAt)
    return summary


def optimizePlan(cls, crewIds, shiftHours):
    clearPlan(cls)
    shift_h = float(shiftHours) if shiftHours else 8.0
    crews = list(c3.MaintenanceCrew.fetch(include="this, currentBuilding.id, currentBuilding.shortName, currentBuilding.latitude, currentBuilding.longitude", limit=-1).objs or [])
    wanted = set(crewIds or [])
    if wanted:
        crews = [c for c in crews if c.id in wanted]
    crews = [c for c in crews if c.status not in ("OffShift", "Unavailable")]
    wos = list(c3.WorkOrder.fetch(include="this, asset.id, asset.assetName, asset.currentFailureProbability, asset.healthScore, asset.status, building.id, building.shortName, building.latitude, building.longitude",
                                  limit=-1).objs or [])
    candidates = [w for w in wos if w.status in SCHEDULABLE and not (w.assignedCrew and w.assignedCrew.id)]

    def value(w):
        return (float(w.priorityScore or 0.0) / 100.0) * (0.25 + float(w.expectedRiskReduction or 0.0))

    state = {}
    for c in crews:
        start_min = _parse_hhmm(c.shiftStart)
        state[c.id] = {"crew": c, "location": c.currentBuilding, "clock": start_min, "end": start_min + int(shift_h * 60), "jobs": [], "hoursUsed": 0.0}
    remaining = list(candidates)
    now = c3.DateTime.now()
    progress = True
    while progress and remaining:
        progress = False
        for cid, st in state.items():
            crew = st["crew"]
            skills = set(list(crew.skills or []))
            best, best_score, best_travel = None, -1.0, 0
            for w in remaining:
                if w.requiredSkill not in skills and not ("General" in skills and w.requiredSkill in ("General",)):
                    continue
                travel = _travel_minutes(st["location"], w.building)
                dur = int(w.estimatedDuration or 60)
                if st["clock"] + travel + dur > st["end"]:
                    continue
                score = value(w) / ((dur + travel) / 60.0)
                if st["location"] is not None and w.building is not None and st["location"].id == w.building.id:
                    score *= SAME_BUILDING_BONUS
                if score > best_score:
                    best, best_score, best_travel = w, score, travel
            if best is None:
                continue
            start = st["clock"] + best_travel
            end = start + int(best.estimatedDuration or 60)
            st["jobs"].append({"wo": best, "start": start, "end": end, "travel": best_travel, "score": best_score})
            st["clock"] = end
            st["location"] = best.building or st["location"]
            st["hoursUsed"] += (int(best.estimatedDuration or 60) + best_travel) / 60.0
            remaining.remove(best)
            progress = True

    # persist
    plan_id = "plan_{}".format(int(now.millis))
    assets_by_id = {}
    all_assets = list(c3.MaintenanceAsset.fetch(include="id, healthScore, currentFailureProbability, status, assetCriticality, building.id", limit=-1).objs or [])
    for a in all_assets:
        assets_by_id[a.id] = a
    current_campus, current_critical = _campus_projection(assets_by_id, {})
    repaired = {}
    assignments = []
    wo_updates = []
    crew_updates = []
    crew_plans = []
    total_rr = 0.0
    seq_global = 0
    for cid, st in state.items():
        crew = st["crew"]
        jobs_out = []
        for i, j in enumerate(st["jobs"]):
            w = j["wo"]
            seq_global += 1
            rr = float(w.expectedRiskReduction or 0.0) * (float(w.priorityScore or 0.0) / 100.0)
            total_rr += rr
            if w.asset and w.expectedRiskReduction:
                repaired[w.asset.id] = max(repaired.get(w.asset.id, 0.0), float(w.expectedRiskReduction))
            assignments.append(c3.CrewAssignment.make({
                "id": "ca_{}_{:02d}".format(plan_id[5:], seq_global), "crew": {"id": crew.id}, "workOrder": {"id": w.id}, "plan": {"id": plan_id},
                "scheduledStart": now, "estimatedCompletion": now.plusMinutes(int(w.estimatedDuration or 60)) if hasattr(now, "plusMinutes") else now,
                "travelTimeMinutes": j["travel"], "priorityScore": w.priorityScore or 0.0, "sequence": i + 1, "riskReduction": round(rr, 3),
            }))
            wo_updates.append(c3.WorkOrder.make({"id": w.id, "status": "Scheduled", "assignedCrew": {"id": crew.id}}))
            row = _wo_row(w)
            row.update({"sequence": i + 1, "startLabel": _label(j["start"]), "endLabel": _label(j["end"]), "travelTimeMinutes": j["travel"],
                        "riskReduction": round(rr, 3), "valuePerHour": round(j["score"], 3)})
            jobs_out.append(row)
        crew_updates.append(c3.MaintenanceCrew.make({"id": crew.id, "status": "Assigned" if st["jobs"] else "Available",
                                                     "availableHours": round(max(0.0, shift_h - st["hoursUsed"]), 2)}))
        crew_plans.append({"crewId": crew.id, "crewName": crew.name, "skills": list(crew.skills or []), "leadName": crew.leadName,
                           "startBuilding": crew.currentBuilding.shortName if crew.currentBuilding else None,
                           "shiftStart": crew.shiftStart, "shiftEnd": crew.shiftEnd, "hoursUsed": round(st["hoursUsed"], 2),
                           "hoursRemaining": round(max(0.0, shift_h - st["hoursUsed"]), 2), "jobs": jobs_out})
    unscheduled = []
    all_skills = set()
    for c in crews:
        all_skills |= set(list(c.skills or []))
    for w in remaining:
        reason = "No available crew has the {} skill".format(w.requiredSkill) if w.requiredSkill not in all_skills else "Does not fit in the remaining shift hours"
        row = _wo_row(w)
        row["reason"] = reason
        unscheduled.append(row)
    projected_campus, projected_critical = _campus_projection(assets_by_id, repaired)
    summary = {
        "method": METHOD,
        "methodDescription": "Greedy heuristic: each crew repeatedly takes the feasible job (skill match, fits remaining shift incl. travel) with the highest priority-weighted risk reduction per hour; travel time from building distance at walking pace. Not a formal optimizer.",
        "shiftHours": shift_h, "crewCount": len(crews), "workOrderCount": len(candidates), "scheduledCount": len(candidates) - len(remaining),
        "unscheduledCount": len(remaining), "totalRiskReduction": round(total_rr, 3), "currentCampusHealth": current_campus,
        "projectedCampusHealth": projected_campus, "currentCriticalAssets": current_critical, "projectedCriticalAssets": projected_critical,
        "crews": crew_plans, "unscheduled": unscheduled, "generatedAt": str(now),
    }
    c3.MaintenancePlan.make({
        "id": plan_id, "createdAt": now, "planDate": now, "crewCount": len(crews), "workOrderCount": len(candidates),
        "scheduledCount": summary["scheduledCount"], "unscheduledCount": len(remaining), "totalRiskReduction": round(total_rr, 3),
        "projectedCriticalAssets": projected_critical, "projectedCampusHealth": projected_campus, "currentCampusHealth": current_campus,
        "optimizationMethod": METHOD, "summary": summary, "isCurrent": True,
    }).create()
    if assignments:
        c3.CrewAssignment.createBatch(assignments)
    if wo_updates:
        c3.WorkOrder.mergeBatch(wo_updates)
    if crew_updates:
        c3.MaintenanceCrew.mergeBatch(crew_updates)
    summary["planId"] = plan_id
    return summary
