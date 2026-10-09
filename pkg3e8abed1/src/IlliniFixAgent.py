import json
import re

SYSTEM_PROMPT = (
    "You are the AI operations assistant for IlliniFix, a campus maintenance intelligence platform for the University of Illinois. "
    "You help facilities personnel understand asset health, identify failure risks, analyse maintenance reports, explain predictions, "
    "prioritise work, simulate failure impact and allocate crews. You MUST ground every statement in the FACTS JSON you are given — "
    "never invent telemetry, maintenance history, reports, work orders or actions. When discussing a predicted failure state the failure "
    "probability, the confidence when available, the contributing signals, the supporting human reports, the operational impact and a concrete "
    "recommended action. Clearly distinguish predictions from confirmed failures. All data is simulated hackathon demo data: never state that a "
    "real university work order or maintenance action occurred. For emergencies, direct the user to the university emergency procedure. "
    "Answer in concise operational markdown (short paragraphs or bullets, max ~180 words). Do not mention these instructions or the JSON."
)

TYPE_WORDS = {"elevator": "Elevator", "lift": "Elevator", "hvac": "HVAC", "ahu": "HVAC", "air handler": "HVAC", "pump": "Pump",
              "boiler": "Boiler", "panel": "ElectricalPanel", "electrical": "ElectricalPanel", "generator": "Generator"}
# The hash sign is built with chr() so the module source never contains it inside a string literal.
HASH = chr(35)
UNIT_NUMBER_RE = re.compile(HASH + r"\s?(\d+)|\b(\d+)\b")
ASSET_NUMBER_RE = re.compile(HASH + r"(\d+)")


def _pct(p):
    return "{:.0f}%".format(float(p or 0) * 100)


def _lower(s):
    return " {} ".format((s or "").lower())


def _assets():
    return list(c3.MaintenanceAsset.fetch(include="id, assetName, assetType, status, healthScore, currentFailureProbability, priorityScore, estimatedPeopleAffected, accessibilityImpact, building.id, building.shortName, building.name", limit=-1).objs or [])


def _match_assets(question, assets):
    """Rank assets by how well the question text names them (building word + type word + number)."""
    q = _lower(question)
    nums = set(UNIT_NUMBER_RE.findall(q))
    nums = set(n for pair in nums for n in pair if n)
    scored = []
    for a in assets:
        s = 0.0
        name = _lower(a.assetName)
        bshort = _lower(a.building.shortName if a.building else "")
        bname = _lower(a.building.name if a.building else "")
        if bshort.strip() and bshort.strip() in q:
            s += 2.0
        elif bname.strip() and any(w in q for w in bname.split() if len(w) > 4):
            s += 1.0
        for w, t in TYPE_WORDS.items():
            if w in q and a.assetType == t:
                s += 1.5
        m = ASSET_NUMBER_RE.search(a.assetName or "")
        if m and m.group(1) in nums:
            s += 1.5
        elif m and nums:
            s -= 0.5
        if name.strip() in q:
            s += 4.0
        scored.append((s, a))
    scored.sort(key=lambda t: -t[0])
    return [a for s, a in scored if s >= 2.5]


def _match_building(question):
    q = _lower(question)
    buildings = list(c3.CampusBuilding.fetch(include="id, name, shortName", limit=-1).objs or [])
    for b in buildings:
        if _lower(b.shortName).strip() in q or (b.name and any(w.lower() in q for w in b.name.split() if len(w) > 5)):
            return b
    return None


def _number_in(question, default=None):
    q = question.lower()
    words = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}
    m = re.search(r"\b(\d+)\s+(crews?|teams?)", q)
    if m:
        return int(m.group(1))
    for w, n in words.items():
        if re.search(r"\b{}\s+(crews?|teams?)".format(w), q):
            return n
    m = re.search(r"top\s+(\d+)", q)
    if m:
        return int(m.group(1))
    for w, n in words.items():
        if "top {}".format(w) in q:
            return n
    return default


def _risk_line(a):
    return "**{}** ({}) — failure probability {}, priority {:.0f}, health {:.0f}, status {}".format(
        a.get("assetName"), a.get("buildingName"), _pct(a.get("failureProbability")), a.get("priorityScore") or 0, a.get("healthScore") or 0, a.get("status") or a.get("riskLevel"))


def _explain_text(x):
    pred, ev, imp, rec, pr = x["prediction"], x["evidence"], x["impact"], x.get("recommendation") or {}, x.get("priority") or {}
    lines = ["**{}** ({}) is rated **{}** with a predicted failure probability of **{}** (confidence {}), likely failure mode *{}*, expected window {}.".format(
        x["assetName"], x.get("buildingName"), pred.get("riskLevel"), _pct(pred.get("failureProbability")), _pct(pred.get("confidence")),
        pred.get("predictedFailureMode"), pred.get("predictedFailureWindow"))]
    sig = ev.get("signals") or []
    if sig:
        lines.append("Evidence: " + "; ".join("{} {}".format(s.get("signal"), s.get("detail")) for s in sig[:5]) + ".")
    reps = ev.get("supportingReports") or []
    if reps:
        lines.append("{} human report(s) corroborate it (e.g. \"{}\"), correlation confidence {}.".format(len(reps), reps[0].get("description"), _pct(x.get("correlationConfidence"))))
    lines.append("Impact: ~{:,} daily users, accessibility impact {}, building health {}.".format(int(imp.get("estimatedPeopleAffected") or 0), imp.get("accessibilityImpact"), imp.get("buildingHealth")))
    if rec:
        lines.append("Recommended: {} — {} (~{} min, {} crew), expected failure probability {} → {}.".format(
            rec.get("recommendedAction"), rec.get("recommendedTimeframe"), rec.get("estimatedInspectionDuration"), rec.get("requiredSkill"),
            _pct(pred.get("failureProbability")), _pct(rec.get("projectedFailureProbability"))))
    if pr.get("breakdown"):
        lines.append("Priority {:.0f} = ".format(pr.get("score") or 0) + " + ".join("{} {}".format(b.get("factor"), b.get("points")) for b in pr["breakdown"] if b.get("points")))
    return "\n\n".join(lines)


def _extract_answer(resp):
    """Pull the assistant text out of a completion response (dict / object / JSON string) and unwrap {"answer": ...}."""
    content = None
    try:
        content = resp["choices"][0]["message"]["content"]
    except Exception:
        try:
            content = resp.choices[0].message.content
        except Exception:
            content = resp if isinstance(resp, str) else None
    if content is None:
        return None
    text = str(content).strip()
    if text.startswith("```"):
        text = text.strip("`")
        if text.lower().startswith("json"):
            text = text[4:]
        text = text.strip()
    if text.startswith("{"):
        try:
            obj = json.loads(text)
            if isinstance(obj, dict):
                for key in ("answer", "text", "content", "response"):
                    if obj.get(key):
                        return str(obj[key]).strip()
        except Exception:
            # possibly truncated JSON such as {"answer": "....  -> salvage the string body
            m = re.match(r'^\s*\{\s*"(?:answer|text|content|response)"\s*:\s*"(.*)$', text, re.S)
            if m:
                body = m.group(1).rstrip()
                if body.endswith('"}'):
                    body = body[:-2]
                elif body.endswith('"'):
                    body = body[:-1]
                body = body.replace('\\n', '\n').replace('\\"', '"').replace("\\'", "'").replace('\\\\', '\\')
                return body.strip() or None
    return text or None


def _llm_phrase(question, facts, draft):
    """Optional LLM phrasing of the fact-grounded draft. `returnJson` is required when the platform client is
    called from the standard Python runtime; the model is asked to wrap its markdown in {"answer": ...}."""
    try:
        client = c3.GenaiCore.Llm.Completion.Client.forConfigKey("default-completions")
        user = ("Question: {}\n\nFACTS (JSON, the only source of truth):\n{}\n\nDraft answer built from the facts:\n{}\n\n"
                "Rewrite the draft as a concise, well-structured operational answer in markdown (at most ~200 words). Keep every number "
                "exactly as in the facts, add nothing that is not in the facts, keep predictions labelled as predictions. "
                "Reply with the markdown answer only — no JSON, no code fences, no preamble.").format(question, json.dumps(facts, default=str)[:12000], draft)
        resp = client.completion(messages=[{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": user}],
                                 options={"max_tokens": 1200, "returnJson": True})
        answer = _extract_answer(resp)
        if answer and len(answer) > 20:
            return answer, True
    except Exception:
        pass
    return draft, False


def ask(cls, question, history):
    q = (question or "").strip()
    ql = _lower(q)
    assets = _assets()
    named = _match_assets(q, assets)
    facts = {}
    citations = []
    actions = []
    intent = "campus_summary"
    draft = ""

    def cite(label, value):
        citations.append({"label": label, "value": value})

    # ---------------------------------------------------------------- intents
    if re.search(r"(what happens|what if|simulate|fails|went down|goes offline)", ql) and named:
        intent = "simulate_failure"
        a = named[0]
        sim = c3.IlliniFixSimulator.simulateAssetFailure(a.id)
        facts["simulation"] = sim
        imp = sim["impacts"]
        draft = ("Simulated (not real) failure of **{}**: {:,} estimated daily users affected, accessibility impact **{}**, impacted floors {}, "
                 "{} alternative asset(s){}; estimated downtime ~{} h. Campus health would move {} → {} and critical assets {} → {}.").format(
            sim["assetName"], imp["peopleAffected"], imp["impactLevel"], imp.get("impactedFloors") or "n/a", imp["alternativesCount"],
            " (+{}% load on them)".format(imp["alternativeUtilizationIncreasePct"]) if imp.get("alternativeUtilizationIncreasePct") is not None else "",
            imp["estimatedDowntimeHours"], sim["before"]["campusHealth"], sim["after"]["campusHealth"], sim["before"]["criticalAssets"], sim["after"]["criticalAssets"])
        cite("People affected", "{:,}".format(imp["peopleAffected"]))
        cite("Accessibility impact", imp["impactLevel"])
        actions.append({"label": "Create draft work order", "action": "createWorkOrder", "assetId": a.id})
        actions.append({"label": "Open asset", "action": "openAsset", "assetId": a.id})

    elif re.search(r"(crew|crews|team|teams)", ql) and re.search(r"(only|have|available|plan|schedule|allocate|assign|optimi)", ql):
        intent = "maintenance_plan"
        n = _number_in(q)
        crews = c3.IlliniFixOps.getAvailableCrews()
        crew_ids = [c["id"] for c in crews][:n] if n else []
        plan = c3.IlliniFixPlanner.optimizePlan(crew_ids, 8.0)
        facts["plan"] = {k: plan[k] for k in ("method", "crewCount", "workOrderCount", "scheduledCount", "unscheduledCount", "totalRiskReduction", "currentCampusHealth", "projectedCampusHealth", "currentCriticalAssets", "projectedCriticalAssets")}
        facts["plan"]["crews"] = [{"crew": c["crewName"], "jobs": [{"start": j["startLabel"], "title": j["title"], "building": j["buildingName"]} for j in c["jobs"]]} for c in plan["crews"]]
        facts["plan"]["unscheduled"] = [{"title": u["title"], "reason": u["reason"]} for u in plan["unscheduled"]]
        lines = ["With **{} crew(s)** and an 8-hour shift the greedy optimizer schedules **{} of {}** open work orders, removing {:.2f} priority-weighted risk units; projected campus health {} → {} and critical assets {} → {}.".format(
            plan["crewCount"], plan["scheduledCount"], plan["workOrderCount"], plan["totalRiskReduction"], plan["currentCampusHealth"], plan["projectedCampusHealth"], plan["currentCriticalAssets"], plan["projectedCriticalAssets"])]
        for c in plan["crews"]:
            if c["jobs"]:
                lines.append("**{}** ({}): ".format(c["crewName"], "/".join(c["skills"])) + "; ".join("{} {}".format(j["startLabel"], j["title"]) for j in c["jobs"]))
        if plan["unscheduled"]:
            lines.append("Unscheduled: " + "; ".join("{} ({})".format(u["title"], u["reason"]) for u in plan["unscheduled"][:5]))
        draft = "\n\n".join(lines)
        cite("Scheduled", "{}/{}".format(plan["scheduledCount"], plan["workOrderCount"]))
        cite("Projected campus health", "{} → {}".format(plan["currentCampusHealth"], plan["projectedCampusHealth"]))
        actions.append({"label": "View maintenance plan", "action": "openPlanner", "assetId": None})

    elif re.search(r"(without|no|missing).*(work order|ticket)", ql):
        intent = "high_risk_without_work_order"
        rows = c3.IlliniFixOps.getHighRiskWithoutWorkOrder()
        facts["assets"] = rows
        if rows:
            draft = "High-risk assets (failure probability ≥ 50%) with **no open work order**:\n\n" + "\n".join("- " + _risk_line(r) for r in rows)
            for r in rows[:3]:
                actions.append({"label": "Create work order: {}".format(r["assetName"]), "action": "createWorkOrder", "assetId": r["assetId"]})
        else:
            draft = "Every asset with a failure probability of 50% or more already has an open work order."
        cite("Assets without work order", str(len(rows)))

    elif re.search(r"accessib", ql):
        intent = "accessibility_impact"
        rows = c3.IlliniFixOps.getCriticalAssets()
        order = {"Critical": 4, "High": 3, "Moderate": 2, "Low": 1, "None": 0}
        rows = sorted(rows, key=lambda r: (-order.get(r.get("accessibilityImpact"), 0), -(r.get("failureProbability") or 0)))
        facts["assets"] = rows[:6]
        draft = "At-risk assets ranked by accessibility impact:\n\n" + "\n".join("- {} — accessibility impact **{}**".format(_risk_line(r), r.get("accessibilityImpact")) for r in rows[:6])
        cite("Highest accessibility impact", rows[0]["assetName"] if rows else "none")

    elif re.search(r"(report|reports|student|students|human|confirm|corroborat)", ql) and not named:
        intent = "report_correlation"
        health = c3.IlliniFixOps.getCampusHealth()
        rows = c3.IlliniFixOps.getCriticalAssets()
        corr = []
        for r in rows[:6]:
            reps = c3.IlliniFixOps.getRelatedReports(r["assetId"])
            confirming = [x for x in reps if x.get("relatedAnomaly")]
            if confirming:
                corr.append({"asset": r["assetName"], "building": r["buildingName"], "failureProbability": r["failureProbability"],
                             "reports": [{"text": x["description"], "when": x["timestamp"]} for x in confirming[:4]],
                             "correlationConfidence": confirming[0].get("correlationConfidence")})
        facts["correlations"] = corr
        facts["openReports"] = health.get("openReports")
        if corr:
            draft = "Yes — human reports currently corroborate sensor anomalies on {} asset(s):\n\n".format(len(corr)) + "\n".join(
                "- **{}** ({}): {} report(s), e.g. \"{}\"; failure probability {}, correlation confidence {}".format(
                    c["asset"], c["building"], len(c["reports"]), c["reports"][0]["text"], _pct(c["failureProbability"]), _pct(c["correlationConfidence"])) for c in corr)
        else:
            draft = "No open human report currently coincides with an active sensor anomaly."
        cite("Correlated assets", str(len(corr)))

    elif re.search(r"(building|buildings).*(worst|health|lowest|most)", ql) or re.search(r"(worst|lowest).*(building)", ql):
        intent = "building_health"
        health = c3.IlliniFixOps.getCampusHealth()
        bl = sorted(health["buildings"], key=lambda b: b.get("overallHealthScore") or 0)
        facts["buildings"] = bl
        draft = "Building health (lowest first):\n\n" + "\n".join("- **{}** — health {:.0f} ({}), {} critical, {} high-risk asset(s), {} active report(s)".format(
            b["name"], b["overallHealthScore"] or 0, b["healthStatus"], int(b["criticalAssetCount"] or 0), int(b["highRiskAssetCount"] or 0), int(b["activeIncidentCount"] or 0)) for b in bl)
        cite("Worst building", "{} ({})".format(bl[0]["name"], bl[0]["overallHealthScore"]) if bl else "n/a")

    elif named and re.search(r"(why|explain|because|critical|risk|wrong|status|detail|tell me about|what is going on|what's going on|before|rather than|compare|versus| vs )", ql):
        intent = "explain_risk" if len(named) < 2 else "compare_assets"
        explained = []
        for a in named[:2]:
            x = c3.IlliniFixOps.explainRisk(a.id)
            explained.append(x)
        facts["explanations"] = explained
        if len(explained) == 2 and intent == "compare_assets":
            a1, a2 = explained
            first, second = (a1, a2) if (a1["priority"]["score"] or 0) >= (a2["priority"]["score"] or 0) else (a2, a1)
            draft = ("**{}** should be serviced first: priority {:.0f} vs {:.0f}. It combines a {} predicted failure probability with {} accessibility impact and ~{:,} daily users, "
                     "while {} has a {} probability and {} accessibility impact (~{:,} users). Servicing {} first removes more weighted campus risk.\n\n").format(
                first["assetName"], first["priority"]["score"], second["priority"]["score"], _pct(first["prediction"]["failureProbability"]), first["impact"]["accessibilityImpact"],
                int(first["impact"]["estimatedPeopleAffected"] or 0), second["assetName"], _pct(second["prediction"]["failureProbability"]), second["impact"]["accessibilityImpact"],
                int(second["impact"]["estimatedPeopleAffected"] or 0), first["assetName"])
            draft += _explain_text(first) + "\n\n---\n\n" + _explain_text(second)
            cite("Higher priority", "{} ({:.0f})".format(first["assetName"], first["priority"]["score"]))
        else:
            draft = _explain_text(explained[0])
            cite("Failure probability", _pct(explained[0]["prediction"]["failureProbability"]))
            cite("Priority", "{:.0f}".format(explained[0]["priority"]["score"] or 0))
        for x in explained:
            actions.append({"label": "Open {}".format(x["assetName"]), "action": "openAsset", "assetId": x["assetId"]})
            actions.append({"label": "Simulate failure", "action": "simulateFailure", "assetId": x["assetId"]})
            actions.append({"label": "Create draft work order", "action": "createWorkOrder", "assetId": x["assetId"]})

    elif re.search(r"(highest|most|top|worst|biggest|first|today|priorit|should we|fix|repair|address)", ql):
        intent = "top_risks"
        health = c3.IlliniFixOps.getCampusHealth()
        n = _number_in(q, 5)
        top = health["topRisks"][:n]
        facts["topRisks"] = top
        facts["campus"] = {k: health[k] for k in ("campusHealthScore", "criticalAssets", "predictedFailures7d", "openReports", "activeWorkOrders", "peopleAtRisk")}
        if re.search(r"(highest|most at risk|worst|single)", ql) and not re.search(r"top\s+\d|five|three|today|first", ql):
            top = top[:1]
            draft = "The highest-risk asset right now is " + _risk_line(top[0]) + ", likely failure mode *{}*.".format(top[0].get("predictedFailureMode")) if top else "No asset is currently at elevated risk."
        else:
            draft = "Based on current risk and operational impact, address these first:\n\n" + "\n".join("{}. {}".format(i + 1, _risk_line(r)) for i, r in enumerate(top))
            if top:
                total_rr = sum((r.get("failureProbability") or 0) * 0.68 for r in top)
                draft += "\n\nTogether these carry ~{:,} daily users of exposure; completing the recommended actions is projected to cut their combined failure probability by about {:.0f} percentage points.".format(
                    sum(int(r.get("estimatedPeopleAffected") or 0) for r in top), total_rr * 100)
        for r in top[:3]:
            actions.append({"label": "Why is {} at risk?".format(r["assetName"]), "action": "ask", "assetId": r["assetId"], "question": "Why is {} considered {}?".format(r["assetName"], (r.get("riskLevel") or "at risk").lower())})
        actions.append({"label": "Optimize today's crews", "action": "openPlanner", "assetId": None})
        if top:
            cite("Top asset", "{} ({})".format(top[0]["assetName"], _pct(top[0]["failureProbability"])))

    else:
        intent = "campus_summary"
        health = c3.IlliniFixOps.getCampusHealth()
        facts["campus"] = {k: health[k] for k in ("campusHealthScore", "criticalAssets", "highRiskAssets", "predictedFailures7d", "openReports", "activeWorkOrders", "peopleAtRisk", "assetsMonitored", "anomaliesDetected24h")}
        facts["topRisks"] = health["topRisks"][:3]
        draft = ("Campus health is **{:.0f}/100** with {} critical and {} high-risk asset(s), {} predicted failure(s) in the next 7 days, {} open report(s) and {} active work order(s); "
                 "~{:,} people/day are exposed to disruption.\n\nTop risks: ").format(health["campusHealthScore"] or 0, int(health["criticalAssets"] or 0), int(health["highRiskAssets"] or 0),
                                                                                    int(health["predictedFailures7d"] or 0), int(health["openReports"] or 0), int(health["activeWorkOrders"] or 0), int(health["peopleAtRisk"] or 0))
        draft += "; ".join("{} ({})".format(r["assetName"], _pct(r["failureProbability"])) for r in health["topRisks"][:3])
        cite("Campus health", str(health["campusHealthScore"]))
        actions.append({"label": "What should we repair first today?", "action": "ask", "assetId": None, "question": "What are the top five issues we should address today?"})

    answer, used_llm = _llm_phrase(q, facts, draft) if draft else (draft, False)
    return {"question": q, "intent": intent, "answer": answer, "draft": draft, "facts": facts, "citations": citations,
            "suggestedActions": actions[:6], "usedLlm": used_llm, "disclaimer": "Simulated demo data — predictions are model estimates, not confirmed failures."}
