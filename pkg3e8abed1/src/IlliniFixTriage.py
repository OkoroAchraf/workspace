import re

HOUR_MS = 3600000.0

EMERGENCY_WORDS = ["burning smell", "smoke", "fire", "gas smell", "smell gas", "sparks", "sparking", "trapped", "flooding",
                   "electrical shock", "exposed wire", "exposed wiring", "carbon monoxide", "explosion"]

CATEGORY_KEYWORDS = {
    "Elevator": {"elevator": 3, "lift": 2, "shook": 1, "shaking": 1, "grinding": 1, "jerk": 1},
    "Plumbing": {"water": 2, "leak": 2, "leaking": 2, "dripping": 2, "drip": 2, "flood": 2, "faucet": 3, "toilet": 3, "drain": 2,
                 "pipe": 2, "hot water": 3, "lukewarm": 2, "shower": 2, "fountain": 2, "sewage": 3, "clog": 2, "backed up": 2, "musty": 1},
    "Electrical": {"outlet": 3, "breaker": 3, "electrical": 3, "spark": 3, "burning": 2, "shock": 2, "wiring": 3, "power": 2, "heater": 1, "sauna": 1},
    "HVAC": {"hot": 2, "warm": 2, "stuffy": 2, "cold": 2, "freezing": 2, " ac ": 3, "a/c": 3, "air conditioning": 3, "heating": 2,
             "vent": 2, "airflow": 2, "thermostat": 3, "humid": 2, "exhaust fan": 3, "fan": 1, "temperature": 2},
    "Lighting": {"light": 2, "lights": 2, "lamp": 2, "bulb": 2, "flicker": 2, "flickering": 2, "dark": 1, "fixture": 2},
    "Structural": {"crack": 3, "cracked": 3, "ceiling tile": 2, "tile": 2, "wall": 1, "window": 2, "glass": 2, "trip hazard": 3,
                   "stairs": 1, "railing": 2, "hazard": 1},
    "General": {"door": 2, "automatic door": 3, "lock": 2, "sign": 1, "furniture": 2, "noise": 1, "rattling": 1, "smell": 1, "odor": 1, "closer": 2},
}
ASSET_TYPE_HINTS = {
    "Elevator": ["elevator", "lift"],
    "Pump": ["pump"],
    "Boiler": ["boiler", "hot water", "lukewarm", "no heat", "heating"],
    "HVAC": [" ac ", "a/c", "air conditioning", "hot", "warm", "stuffy", "cold", "freezing", "vent", "airflow", "thermostat", "exhaust fan", "fan"],
    "ElectricalPanel": ["electrical closet", "electrical room", "panel", "breaker", "outlet", "burning", "power", "flicker"],
    "Generator": ["generator"],
}
CATEGORY_TO_TYPES = {"Elevator": ["Elevator"], "HVAC": ["HVAC", "Boiler"], "Plumbing": ["Boiler", "Pump"], "Electrical": ["ElectricalPanel", "Generator"],
                     "Lighting": ["ElectricalPanel"], "General": ["Pump", "Elevator", "HVAC"], "Structural": [], "Other": []}
BASE_SEVERITY = {"Elevator": 2, "Plumbing": 2, "Electrical": 2, "HVAC": 1, "Lighting": 1, "Structural": 2, "General": 1, "Other": 1}
SEVERITY_LEVELS = ["Low", "Medium", "High", "Critical"]
ESCALATE_WORDS = ["grinding", "shaking", "shook", "stuck", "flood", "ceiling", "not working", "broken", "hazard", "burning", "backed up", "no hot water", "won't shut off"]
STOPWORDS = set("the a an is are was were be been of in on at to for from by with and or but near outside inside has have had it its this that there seems seem doesn't don't isn't really very all my our so just like when".split())
MECH_WORDS = ["shak", "shook", "grind", "noise", "vibrat", "jerk", "rattl", "loud"]


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
        return int(c3.DateTime.fromString(str(d)).millis)
    except Exception:
        return None


def _lower(text):
    return " {} ".format((text or "").lower())


def _classify(text):
    t = _lower(text)
    scores = {}
    matched = {}
    for cat, kws in CATEGORY_KEYWORDS.items():
        s = 0
        hits = []
        for kw, w in kws.items():
            if kw in t:
                s += w
                hits.append(kw.strip())
        if s:
            scores[cat] = s
            matched[cat] = hits
    # disambiguation rules
    if "elevator" in t or " lift " in t:
        scores["Elevator"] = scores.get("Elevator", 0) + 10
    if any(w in t for w in ["water", "leak", "dripping", "drip", "flood"]):
        scores["Plumbing"] = scores.get("Plumbing", 0) + 4
    if any(w in t for w in ["light", "lights", "lamp", "bulb"]) and "flicker" not in t and "outlet" not in t:
        scores["Lighting"] = scores.get("Lighting", 0) + 3
    if any(w in t for w in ["pump", "rattling", "rattle"]):
        scores["General"] = scores.get("General", 0) + 3
    if not scores:
        return "Other", 0.4, []
    ranked = sorted(scores.items(), key=lambda kv: -kv[1])
    top, top_s = ranked[0]
    second = ranked[1][1] if len(ranked) > 1 else 0
    confidence = _clamp(0.55 + 0.05 * top_s - 0.03 * second, 0.45, 0.97)
    return top, round(confidence, 2), matched.get(top, [])


def _probable_issue(category, text):
    t = _lower(text)
    if category == "Elevator":
        if any(w in t for w in MECH_WORDS):
            return "Elevator vibration / abnormal noise"
        if any(w in t for w in ["door", "stuck", "slow", "button"]):
            return "Elevator door / control fault"
        return "Elevator malfunction"
    if category == "Plumbing":
        if any(w in t for w in ["hot water", "lukewarm", "shower"]):
            return "Loss of hot water"
        if any(w in t for w in ["drain", "backed up", "clog", "pooling"]):
            return "Drain blockage"
        if any(w in t for w in ["faucet", "shut off", "running"]):
            return "Fixture fault"
        if any(w in t for w in ["leak", "drip", "water", "ceiling", "musty"]):
            return "Water leak"
        return "Plumbing fault"
    if category == "HVAC":
        if any(w in t for w in ["hot", "warm", "stuffy", "ac", "a/c", "cooling"]):
            return "Insufficient cooling"
        if any(w in t for w in ["cold", "freezing", "heat"]):
            return "Insufficient heating"
        if any(w in t for w in ["fan", "loud", "noise", "exhaust"]):
            return "HVAC fan noise / vibration"
        return "HVAC comfort issue"
    if category == "Electrical":
        if any(w in t for w in ["burning", "smell", "smoke", "hot"]):
            return "Possible electrical overheating"
        if any(w in t for w in ["outlet", "power", "not working", "heater"]):
            return "Loss of power / dead circuit"
        return "Electrical fault"
    if category == "Lighting":
        return "Lighting flicker" if "flicker" in t else "Lighting outage"
    if category == "Structural":
        return "Structural hazard"
    if category == "General":
        if "door" in t:
            return "Door malfunction"
        if any(w in t for w in MECH_WORDS):
            return "Mechanical noise / vibration"
        return "General facility issue"
    return "Unclassified issue"


def _severity(category, text, emergency, related_anomaly, asset_probability):
    t = _lower(text)
    level = BASE_SEVERITY.get(category, 1)
    if any(w in t for w in ESCALATE_WORDS):
        level += 1
    if related_anomaly and (asset_probability or 0) >= 0.6:
        level += 1
    if emergency:
        level = 3
    return SEVERITY_LEVELS[max(0, min(3, level))]


def _tokens(text):
    words = re.findall(r"[a-z0-9/]+", (text or "").lower())
    out = set()
    for w in words:
        if w in STOPWORDS or len(w) < 2:
            continue
        for suffix in ("ing", "ed", "s"):
            if len(w) > 4 and w.endswith(suffix):
                w = w[: -len(suffix)]
                break
        out.add(w)
    return out


def _room_numbers(text):
    return set(re.findall(r"\b\d{3,4}\b", text or ""))


def _similarity(a, b, issue_a, issue_b):
    ta, tb = _tokens(a.description), _tokens(b.description)
    jacc = len(ta & tb) / float(len(ta | tb)) if (ta | tb) else 0.0
    score = jacc
    if _room_numbers(a.description) & _room_numbers(b.description):
        score += 0.3
    if issue_a and issue_a == issue_b:
        score += 0.2
    if a.zone and b.zone and a.zone.id == b.zone.id:
        score += 0.15
    dt = abs((_ms(a.timestamp) or 0) - (_ms(b.timestamp) or 0))
    if dt <= 6 * HOUR_MS:
        score += 0.1
    return round(score, 3)


def _candidate_assets(report, category, text, assets):
    t = _lower(text)
    types = list(CATEGORY_TO_TYPES.get(category, []))
    for atype, hints in ASSET_TYPE_HINTS.items():
        if any(h in t for h in hints) and atype not in types:
            types.append(atype)
    if not report.building or not types:
        return []
    cands = [a for a in assets if a.building and a.building.id == report.building.id and a.assetType in types]
    # a Pump is only a plausible target when mechanical words are present
    if category in ("Plumbing", "General"):
        cands = [a for a in cands if a.assetType != "Pump" or any(w in t for w in MECH_WORDS + ["pump"])]
    # order: hinted type first, then highest failure probability
    hinted = [atype for atype, hints in ASSET_TYPE_HINTS.items() if any(h in t for h in hints)]

    def rank(a):
        return (0 if a.assetType in hinted else 1, -(a.currentFailureProbability or 0.0))

    return sorted(cands, key=rank)


def _correlation_for_asset(asset, related, text_hits, anomaly_sensors, history_match):
    if not related:
        return 0.0
    conf = 0.35 * (1.0 if anomaly_sensors else 0.0) + 0.2 * _clamp(len(related) / 3.0) + 0.2 * text_hits + 0.15 * (1.0 if anomaly_sensors else 0.5) + 0.1 * (1.0 if history_match else 0.0)
    return round(_clamp(conf, 0.0, 0.96), 2)


def _current_prediction(asset_id):
    preds = list(c3.FailurePrediction.fetch(filter=c3.Filter.eq("asset.id", asset_id).and_(c3.Filter.eq("isCurrent", True)),
                                            include="this", limit=1).objs or [])
    return preds[0] if preds else None


def _emergency_guidance():
    return ("Life-safety indicators detected. Follow the university emergency procedure now: call 911 for immediate danger and the "
            "configured Facilities & Services emergency line (demo contact: 217-333-0340). The standard work-order flow is NOT "
            "sufficient for this report.")


def _triage_one(report, assets, all_reports, next_cluster_no, group_of=None):
    """Triage one report against the current state. Returns (result dict, merge payload, next_cluster_no).
    `group_of` maps already-processed report ids to cluster ids assigned during this run."""
    group_of = group_of if group_of is not None else {}
    text = report.description or ""
    t = _lower(text)
    emergency = any(w in t for w in EMERGENCY_WORDS)
    category, confidence, keywords = _classify(text)
    issue = _probable_issue(category, text)

    cands = _candidate_assets(report, category, text, assets)
    asset = cands[0] if cands else None
    pred = _current_prediction(asset.id) if asset else None
    p = float(pred.failureProbability) if pred and pred.failureProbability is not None else float(asset.currentFailureProbability or 0.0) if asset else 0.0
    related_anomaly = bool(asset and p >= 0.35)
    severity = _severity(category, text, emergency, related_anomaly, p)

    # duplicate detection against already-processed reports (same building + category, within 48h)
    group_id = None
    dup_prob = 0.0
    dup_matches = []
    for other in all_reports:
        if other.id == report.id or not other.building or not report.building or other.building.id != report.building.id:
            continue
        if other.category != category:
            continue
        dt = abs((_ms(other.timestamp) or 0) - (_ms(report.timestamp) or 0))
        if dt > 48 * HOUR_MS:
            continue
        other_issue = other.probableIssue or _probable_issue(other.category or category, other.description)
        sim = _similarity(report, other, issue, other_issue)
        if sim >= 0.45:
            dup_matches.append({"reportId": other.id, "similarity": sim, "description": other.description})
    if dup_matches:
        best = max(dup_matches, key=lambda m: m["similarity"])
        matched_ids = [m["reportId"] for m in dup_matches]
        existing = [group_of.get(o.id) or o.duplicateGroupId for o in all_reports if o.id in matched_ids and (group_of.get(o.id) or o.duplicateGroupId)]
        group_id = existing[0] if existing else "inc_{:03d}".format(next_cluster_no)
        if not existing:
            next_cluster_no += 1
        for mid in matched_ids:
            group_of.setdefault(mid, group_id)
        group_of[report.id] = group_id
        dup_prob = round(min(0.98, 0.5 + 0.5 * best["similarity"]), 2)

    # correlation with the linked asset's other reports
    corr = 0.0
    related_ids = []
    if asset:
        siblings = [o for o in all_reports if o.id != report.id and o.status != "Resolved" and
                    ((o.asset and o.asset.id == asset.id) or (o.building and o.building.id == asset.building.id and o.category == category))]
        related_ids = [o.id for o in siblings]
        all_rel = siblings + [report]
        mech = MECH_WORDS + ["hot", "warm", "stuffy", "cold", "burn", "smell", "hot water", "lukewarm", "door"]
        hits = sum(1 for r in all_rel if any(w in _lower(r.description) for w in mech)) / float(len(all_rel))
        corr = _correlation_for_asset(asset, all_rel, hits, related_anomaly, bool(pred and pred.modelFeatures and (pred.modelFeatures.get("features") or {}).get("H")))

    status = report.status or "New"
    if status in ("New", "Triaged", "Linked"):
        status = "Linked" if asset else "Triaged"

    recommended = []
    if emergency:
        recommended.append(_emergency_guidance())
    if asset and related_anomaly:
        recommended.append("Linked to {} (predicted failure probability {:.0f}%): the human report corroborates the sensor anomaly — raise or expedite the predictive work order.".format(asset.assetName, p * 100))
    elif asset:
        recommended.append("Linked to {} (no active sensor anomaly): dispatch a {} inspection.".format(asset.assetName, category.lower()))
    else:
        recommended.append("No monitored asset matched; route to the {} dispatcher as a location-based incident.".format(category.lower()))
    if group_id:
        recommended.append("Grouped into incident cluster {} — treat as one incident, not {} separate tickets.".format(group_id, len(dup_matches) + 1))

    summary = {
        "matchedKeywords": keywords,
        "candidateAssets": [{"id": a.id, "name": a.assetName, "failureProbability": a.currentFailureProbability} for a in cands[:4]],
        "duplicateMatches": dup_matches,
        "relatedReportIds": related_ids,
        "classifier": "keyword-rules-v1",
        "emergencyWords": [w for w in EMERGENCY_WORDS if w in t],
    }
    payload = c3.StudentReport.make({
        "id": report.id, "category": category, "severity": severity, "status": status, "confidence": confidence,
        "probableIssue": issue, "duplicateGroupId": group_id, "duplicateProbability": dup_prob, "emergencyFlag": emergency,
        "asset": {"id": asset.id} if asset else None, "relatedAnomaly": related_anomaly, "correlationConfidence": corr,
        "triageSummary": summary,
    })
    result = {
        "reportId": report.id, "description": text, "category": category, "severity": severity, "probableIssue": issue,
        "confidence": confidence, "status": status,
        "building": {"id": report.building.id, "name": getattr(report.building, "name", None)} if report.building else None,
        "likelyAsset": {"id": asset.id, "name": asset.assetName, "assetType": asset.assetType, "failureProbability": round(p, 3)} if asset else None,
        "relatedAnomaly": related_anomaly, "failureProbability": round(p, 3) if asset else None,
        "correlationConfidence": corr, "relatedReports": related_ids, "relatedReportCount": len(related_ids),
        "duplicateGroupId": group_id, "duplicateProbability": dup_prob, "duplicateCount": len(dup_matches),
        "emergencyFlag": emergency, "emergencyGuidance": _emergency_guidance() if emergency else None,
        "recommendedResponse": " ".join(recommended), "matchedKeywords": keywords,
        "predictedFailureMode": pred.predictedFailureMode if pred else None,
    }
    return result, payload, next_cluster_no


def _load():
    assets = list(c3.MaintenanceAsset.fetch(include="this, building.id, building.name", limit=-1).objs or [])
    reports = list(c3.StudentReport.fetch(include="this, asset.id, building.id, building.name, zone.id", order="timestamp", limit=-1).objs or [])
    return assets, reports


def _next_cluster_no(reports):
    n = 0
    for r in reports:
        if r.duplicateGroupId and r.duplicateGroupId.startswith("inc_"):
            try:
                n = max(n, int(r.duplicateGroupId[4:]))
            except Exception:
                pass
    return n + 1


def submitReport(cls, description, buildingId, zoneId, imageUrl, reporterType):
    if not description or not description.strip():
        raise ValueError("A description is required")
    now = c3.DateTime.now()
    rid = "rpt_{}".format(int(now.millis))
    row = {"id": rid, "timestamp": now, "description": description.strip(), "status": "New",
           "reporterType": reporterType or "Student", "isDemoGenerated": False}
    if buildingId:
        row["building"] = {"id": buildingId}
    if zoneId:
        row["zone"] = {"id": zoneId}
    if imageUrl:
        row["imageUrl"] = imageUrl if len(imageUrl) < 400000 else None
    c3.StudentReport.make(row).create()
    return triageReport(cls, rid)


def triageReport(cls, reportId):
    assets, reports = _load()
    target = [r for r in reports if r.id == reportId]
    if not target:
        raise ValueError("Unknown report " + str(reportId))
    result, payload, _ = _triage_one(target[0], assets, [r for r in reports if r.id != reportId], _next_cluster_no(reports))
    payload.merge()
    return result


def triageAll(cls):
    assets, reports = _load()
    processed = []
    payloads = []
    next_no = 1
    group_of = {}
    for r in reports:
        # clear stale cluster ids so clusters are rebuilt from scratch, chronologically
        processed_view = c3.StudentReport.make({"id": r.id, "timestamp": r.timestamp, "description": r.description,
                                                "building": r.building, "zone": r.zone, "status": r.status})
        result, payload, next_no = _triage_one(r, assets, processed, next_no, group_of)
        payloads.append(payload)
        # the processed view reflects the new classification for subsequent duplicate checks
        processed.append(processed_view.withCategory(result["category"]).withProbableIssue(result["probableIssue"])
                         .withAsset(payload.asset).withStatus(result["status"]))
    # the earliest member of each cluster was processed before its duplicates existed: give it the cluster id too
    final = []
    for pl in payloads:
        gid = group_of.get(pl.id)
        if gid and not pl.duplicateGroupId:
            pl = pl.withDuplicateGroupId(gid).withDuplicateProbability(0.9)
        elif not gid:
            pl = pl.withDuplicateGroupId(None).withDuplicateProbability(0.0)
        final.append(pl)
    for i in range(0, len(final), 200):
        c3.StudentReport.mergeBatch(final[i:i + 200])
    # merge() ignores nulls, so reports that left a cluster are rewritten with update() to clear the stale id
    stale_ids = set(pl.id for pl in final if not group_of.get(pl.id))
    for r in reports:
        if r.duplicateGroupId and r.id in stale_ids:
            try:
                r.withDuplicateGroupId(None).withDuplicateProbability(0.0).update()
            except Exception:
                pass
    groups = {}
    for rid, gid in group_of.items():
        groups.setdefault(gid, []).append(rid)
    return {"triaged": len(final), "clusters": groups, "clusterCount": len(groups)}


def getCorrelation(cls, assetId):
    asset = c3.MaintenanceAsset.forId(assetId).get("this, building.id, building.name, building.shortName")
    pred = _current_prediction(assetId)
    reports = list(c3.StudentReport.fetch(include="this, asset.id, building.id", order="timestamp", limit=-1).objs or [])
    related = [r for r in reports if r.status != "Resolved" and ((r.asset and r.asset.id == assetId) or
               (not r.asset and r.building and asset.building and r.building.id == asset.building.id and
                r.category in {"Elevator": ["Elevator"], "HVAC": ["HVAC"], "Pump": ["General"], "Boiler": ["Plumbing"], "ElectricalPanel": ["Electrical"]}.get(asset.assetType, [])))]
    sensors = []
    features = {}
    if pred and pred.modelFeatures:
        features = pred.modelFeatures.get("features") or {}
        for s in pred.modelFeatures.get("sensors") or []:
            if s.get("severity", 0) >= 0.15:
                sign = "+" if s.get("deviationPct", 0) >= 0 else ""
                sensors.append({"signal": s.get("name"), "detail": "{}{:.1f}% vs baseline".format(sign, s.get("deviationPct", 0)),
                                "severity": s.get("severity"), "anomalies24h": s.get("anomalies24h")})
    history = list(c3.MaintenanceHistory.fetch(filter=c3.Filter.eq("asset.id", assetId), include="this", order="descending(serviceDate)", limit=-1).objs or [])
    hist_match = [h for h in history if pred and h.failureMode == pred.predictedFailureMode]
    human = [{"reportId": r.id, "timestamp": str(r.timestamp), "description": r.description, "severity": r.severity,
              "reporterType": r.reporterType, "correlationConfidence": r.correlationConfidence} for r in related]
    mech = MECH_WORDS + ["hot", "warm", "stuffy", "cold", "burn", "smell", "hot water", "lukewarm", "door"]
    hits = (sum(1 for r in related if any(w in _lower(r.description) for w in mech)) / float(len(related))) if related else 0.0
    conf = _correlation_for_asset(asset, related, hits, bool(sensors), bool(hist_match))
    p = float(pred.failureProbability) if pred else 0.0
    verdict = "CORRELATED INCIDENT" if conf >= 0.6 and sensors else ("HUMAN REPORTS ONLY" if related and not sensors else ("SENSOR ANOMALY ONLY" if sensors else "NO ACTIVE SIGNALS"))
    return {
        "assetId": assetId, "assetName": asset.assetName, "buildingName": asset.building.shortName if asset.building else None,
        "machineSignals": sensors, "humanSignals": human,
        "historicalSignal": ({"serviceDate": str(hist_match[0].serviceDate), "failureMode": hist_match[0].failureMode, "description": hist_match[0].description} if hist_match else None),
        "confidence": conf, "failureProbability": round(p, 3), "probableFailure": pred.predictedFailureMode if pred else None,
        "verdict": verdict, "features": features,
    }
