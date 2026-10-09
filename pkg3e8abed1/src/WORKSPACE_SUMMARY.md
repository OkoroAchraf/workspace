# Workspace Summary — IlliniFix

> Work-to-date map of this workspace (keep concise; update after meaningful changes).

## Current state

**IlliniFix — AI-Powered Campus Maintenance Command Center** (UIUC, simulated demo data) is built end to end:
C3 data model + Python analytics services + JS read façade + React command-center UI + in-app Operations Agent
+ Demo Mode. Build mode: full-spec (Mode A).

## Packages

- `pkg3e8abed1` (main, deps: `mcpServer` → resolves `genaiPlatform` 8.11). Package name must not change.
- `resource/generate_demo_data.py` — deterministic synthetic dataset generator (writes `data/<Type>/*.json`).
  Run from the package folder: `python3 resource/generate_demo_data.py`, then `upsertSeedData`, then
  `IlliniFixRiskEngine.recomputeAll()`.

## Backend types (`src/`)

Entity types (all plain `entity type`, rows under `data/<Type>/`):

| Type | Purpose / key fields |
| --- | --- |
| `CampusBuilding` | 6 UIUC buildings; lat/long; occupancy; rollups `overallHealthScore`, `healthStatus`, `activeIncidentCount`, `highRiskAssetCount`, `criticalAssetCount` (written by risk engine) |
| `CampusZone` | 20 floors/wings/mechanical rooms (`building`, `floor`, `zoneType`, `requiresAccessibleRoute`) |
| `MaintenanceAsset` | 30 assets (6 elevators, 8 HVAC, 5 pumps, 4 boilers, 6 panels, 1 generator); rollups `healthScore`, `currentFailureProbability`, `priorityScore`, `status` |
| `Sensor` | 109 channels; `baselineMean/StdDev`, `normalMin/Max`, `badDirection`, `diurnalAmplitude` |
| `SensorReading` | 18,312 hourly readings (7 days × 109 sensors); `anomalyScore` = |z|, `isAnomaly` = |z| > 2.5; ids `sr_<sensor>_<idx>` so regeneration overwrites in place |
| `StudentReport` | 34 human reports; triage fills `category`, `severity`, `probableIssue`, `asset`, `duplicateGroupId`, `correlationConfidence`, `relatedAnomaly`, `emergencyFlag`, `triageSummary`; `isDemoGenerated` |
| `MaintenanceHistory` | 58 records; `failureMode` vocabulary matches predictions (history-match feature H) |
| `FailurePrediction` | model output per asset (`isCurrent` = latest): probability, window, mode, confidence, `topContributingSignals`, `priorityBreakdown`, `modelFeatures` |
| `MaintenanceRecommendation` | action / timeframe / duration / skill / `expectedRiskReduction` / `projectedFailureProbability` |
| `WorkOrder` | 21 seeded + created ones; `source`, `status`, `requiredSkill`, `assignedCrew`, `isDemoGenerated` |
| `MaintenanceCrew` | 4 crews (Alpha Mech/Elev, Bravo HVAC/Mech, Charlie Elec/General, Delta Plumbing/General) |
| `CrewAssignment`, `MaintenancePlan` | optimizer output (plan `isCurrent`, per-crew `summary` json) |
| `SimulationScenario` | failure / repair what-ifs (`resultSummary` json); never touches asset state |

Service types (static methods only):

| Type | Lang | Methods |
| --- | --- | --- |
| `IlliniFixOps` | JS | `ensureInitialized`, `getCampusHealth`, `getBuildingHealth`, `getCriticalAssets`, `getAssets`, `getReports(filter)`, `getAssetDetails`, `getAssetTelemetry`, `getFailurePrediction`, `getRelatedReports`, `getMaintenanceHistory`, `explainRisk`, `getWorkOrders(filter)`, `getAvailableCrews`, `getRiskTrend`, `getReportClusters`, `getAnalyticsSummary`, `getHighRiskWithoutWorkOrder`, `createDraftWorkOrder`, `assignCrew`, `updateWorkOrderStatus` |
| `IlliniFixRiskEngine` | Py | `recomputeAll`, `scoreAsset`, `recomputeAsset` — z-score anomaly → features A,T,R,H,O → logistic p = σ(-3.3+3.2A+1.0T+0.7R+0.5H+0.5O); health = 100-(30p+12A+8O+6R+8p·crit); priority = 35/20/15/15/10/5 weights (impact factors scaled by p/0.6); two-phase report attribution; writes predictions, recommendations, asset + building rollups; ends with `IlliniFixTriage.triageAll()` |
| `IlliniFixTriage` | Py | `submitReport`, `triageReport`, `triageAll`, `getCorrelation` — keyword classifier, emergency words, asset linking (building + category + wording, highest p), duplicate clusters (`inc_NNN`: same building/category, ≤48 h, token Jaccard + room numbers + same issue + same zone), correlation confidence |
| `IlliniFixPlanner` | Py | `optimizePlan(crewIds, shiftHours)`, `getCurrentPlan`, `clearPlan` — greedy risk-reduction-per-hour heuristic with haversine travel time |
| `IlliniFixSimulator` | Py | `simulateAssetFailure`, `simulateRepair`, `listScenarios` |
| `IlliniFixAgent` | Py | `ask(question, history)` — intent router → data tools (Ops/Planner/Simulator) → facts → optional LLM phrasing via `GenaiCore.Llm.Completion.Client` `default-completions` (falls back to deterministic template); returns answer, citations, suggestedActions, usedLlm |
| `IlliniFixDemo` | Py | `seedTelemetry`, `injectElevatorDegradation`, `injectHvacFailure`, `submitDemoReport`, `resetDemo`, `getDemoState` — sha256 hash-noise generator identical to `resource/generate_demo_data.py`; `DEGRADATION_PROFILES` mirrored in both |

Demo scenarios encoded in data: **A** Grainger Elevator #2 (motor current/vibration/temperature ramp 72 h, 3 reports,
bearing history, 14 d overdue → ~86% Critical, priority ~90); **B** CIF HVAC #7 (supply temp/fan current up, airflow
down, 3 "hot room" reports → ~75% High); **C** CIF ceiling-leak reports → duplicate cluster `inc_001`; plus ARC Pump #3
(High), ISR Boiler #2 / ISR Townsend Elevator #1 / Siebel HVAC #6 (Moderate), ECEB Panel #4 (Monitor, emergency
"burning smell" report).

## UI (`ui/react/src`)

- Shell: `App.tsx` (TopNav title "IlliniFix" + `TopNavActions` [Demo Mode, Ask IlliniFix], SideNav, lazy routes,
  `AgentDrawer` right panel, `DemoModePanel` modal). Context `contexts/IlliniFixProvider.tsx` (refreshKey, agent/demo
  open state, `askAgent`, lazy `ensureInitialized`). Theme defaults to dark (`hooks/useTheme.ts`); IlliniFix tokens
  (`--ifx-*`) + navy/orange overrides in `globals.css`.
- Data layer: `shared/api.ts` (typed `c3Action` wrappers, `errorMessage`), `hooks/useApiData.ts`, `Interfaces.tsx`
  (all backend shapes), `lib/format.ts`, `lib/status.ts` (tone mapping).
- Components `components/illinifix/`: `StatusBadge`, `HealthScore`, `KpiTile`, `Panel`, `States`, `TelemetryChart`
  (Recharts), `PriorityBreakdown`, `CorrelationDiagram`, `CampusMap` (react-leaflet, CARTO dark tiles),
  `SimulationCards`, `AgentDrawer`, `DemoModePanel`, `TopNavActions`.
- Routes / nav (`config/navigation.ts`): `/` Overview · `/map` Campus Map · `/assets` + `/assets/:assetId` ·
  `/reports` (tabs: queue, clusters, new) · `/work-orders` · `/crews` Crew Planner · `/simulations` · `/analytics`.
- Build: `cd ui/react && VITE_C3_PKG=pkg3e8abed1 npm run build` (lint + tsc + vite).

## Seed / data

`data/{CampusBuilding,CampusZone,MaintenanceAsset,Sensor,SensorReading,StudentReport,MaintenanceHistory,
MaintenanceCrew,WorkOrder}/` generated by `resource/generate_demo_data.py` (timestamps relative to generation time;
Demo Mode "Refresh Demo Clock" regenerates telemetry ending now). Predictions/recommendations/plans/scenarios are
computed, not seeded; `IlliniFixOps.ensureInitialized` runs triage + risk scoring on first UI load if none exist.

## Verification done (Tier 1)

- `npm run build` (lint + tsc + vite) green — run with `VITE_C3_PKG=pkg3e8abed1` outside the managed dev server.
- Every `c3Action` the UI makes was replayed via `runJsCode`/`runPyCode` against live data: `getCampusHealth`
  (campus 77, 1 critical, 3 predicted failures, 32 open reports, 19 active work orders, 3,300 people at risk),
  `getAssets`, `getAssetDetails`/`getAssetTelemetry`/`explainRisk` (Grainger Elevator #2: 86 %, Critical, priority 90,
  3 corroborating reports, correlation 93 %), `getBuildingHealth`, `getReports`, `getReportClusters` (3 clusters incl.
  the 3-report CIF leak cluster), `getRiskTrend`, `getAnalyticsSummary`, `getWorkOrders`, `getAvailableCrews`,
  `getHighRiskWithoutWorkOrder`, `CampusBuilding/CampusZone.fetch`, `IlliniFixTriage.submitReport`,
  `IlliniFixSimulator.simulateAssetFailure/simulateRepair`, `IlliniFixPlanner.optimizePlan` (14/17 scheduled),
  `IlliniFixAgent.ask`, `IlliniFixDemo.*`.
- Browser (Playwright at `localhost:9000`) renders the shell/pages and the honest error states; API calls cannot be
  authenticated from a cookie-less browser in this environment (`/api` proxy redirects to Okta), so data-bearing
  screens were verified through the replay path above. Inside the C3 Code preview (Genesis cookies) the same calls work.

## Platform gotchas learned

- Server JS arrays from `fetch().objs` lack `Array.prototype.reduce` — copy into native arrays (`_fetchAll`) and avoid `reduce`.
- `Type.get(id, include)` is not valid in server JS — fetch by `Filter.eq('id', …)` (or `forId(id).get(...)`).
- `removeAll` requires `RemoveAllSpec` + `confirm=true` (`_remove_where` helpers in Planner/Demo).
- `GenaiCore.Llm.Completion.Client.completion(...)` from the `py` runtime needs `options.returnJson = true` (it only controls
  the response transport) and must not set `temperature` (the configured Claude Sonnet model only accepts the default). The
  agent asks for plain markdown and still unwraps `{"answer": …}` defensively (`_extract_answer`), including truncated JSON.
- `runPyCode` evaluates the last *line* as the result — keep the final expression on one line.
- Python `DateTime.millis` / `hourOfDay` are properties; JS `DateTime.millis` is a property too.

## Key decisions

- Statistical, fully explainable model (z-score + fixed-coefficient logistic) instead of a trained ML model — every
  number is traceable to telemetry, reports, history and maintenance dates; nothing per-asset is hard-coded.
- Reports are attributed to the most anomalous plausible asset (engine) and linked the same way by triage, so results
  are deterministic in one pass.
- Agent is the in-app `IlliniFixAgent` (tool-grounded, LLM phrasing optional). Agentix (Nexus) is registered on the
  cluster (`Microservice.Config.forName("Nexus")`, URL-only) but a native Agentix agent / embedded chat was not wired.
- Work orders / simulations are IlliniFix records only; UI labels all data as simulated demo data.
- Summaries live in `src/` (template placed them there, not `resource/`).
