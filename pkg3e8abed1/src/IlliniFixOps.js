/*
 * IlliniFixOps — read / aggregate façade shared by the React UI and the Operations Agent.
 * Server-side JavaScript (ES5). All heavy modelling lives in the Python services; this file only
 * joins, filters and shapes data so every screen and every agent answer quotes the same numbers.
 */

var CATEGORIES_FOR_TYPE = {
  Elevator: ['Elevator'],
  HVAC: ['HVAC'],
  Pump: ['General', 'Plumbing'],
  Boiler: ['Plumbing', 'HVAC'],
  ElectricalPanel: ['Electrical', 'Lighting'],
  Generator: ['Electrical'],
};
var OPEN_WO_STATUSES = ['Draft', 'Scheduled', 'Assigned', 'InProgress'];
var DEFAULT_DOWNTIME_H = { Elevator: 36, HVAC: 24, Pump: 12, Boiler: 30, ElectricalPanel: 10, Generator: 8 };
var PRIORITY_FOR_RISK = { Critical: 'Critical', High: 'High', Moderate: 'Medium', Low: 'Low' };

// ------------------------------------------------------------------------------------ helpers
function _iso(d) {
  return d ? String(d) : null;
}

function _ms(d) {
  if (!d) return null;
  if (typeof d.millis === 'number') return d.millis;
  var p = Date.parse(String(d));
  return isNaN(p) ? null : p;
}

function _num(x, dflt) {
  if (x === null || x === undefined) return dflt === undefined ? null : dflt;
  return Number(x);
}

function _fetchAll(type, spec) {
  spec = spec || {};
  if (spec.limit === undefined) spec.limit = -1;
  var res = type.fetch(spec);
  var objs = res && res.objs ? res.objs : [];
  // Copy into a native array: the platform's array wrapper lacks some ES5 methods (e.g. reduce).
  var out = [];
  for (var i = 0; i < objs.length; i++) out.push(objs[i]);
  return out;
}

function _sum(rows, fn) {
  var s = 0;
  for (var i = 0; i < rows.length; i++) s += fn(rows[i]);
  return s;
}

function _indexBy(rows, keyFn) {
  var out = {};
  rows.forEach(function (r) {
    var k = keyFn(r);
    if (k !== null && k !== undefined) out[k] = r;
  });
  return out;
}

function _groupBy(rows, keyFn) {
  var out = {};
  rows.forEach(function (r) {
    var k = keyFn(r);
    if (k === null || k === undefined) return;
    if (!out[k]) out[k] = [];
    out[k].push(r);
  });
  return out;
}

function _statusForHealth(h) {
  if (h === null || h === undefined) return 'Healthy';
  if (h >= 90) return 'Healthy';
  if (h >= 75) return 'Monitor';
  if (h >= 50) return 'Warning';
  return 'Critical';
}

function _currentPredictions() {
  return _fetchAll(FailurePrediction, { filter: Filter.eq('isCurrent', true), include: 'this, asset.id' });
}

function _currentRecommendations() {
  return _fetchAll(MaintenanceRecommendation, { filter: Filter.eq('isCurrent', true), include: 'this, asset.id, prediction.id' });
}

function _openWorkOrdersByAsset(workOrders) {
  var out = {};
  workOrders.forEach(function (w) {
    if (w.asset && w.asset.id && OPEN_WO_STATUSES.indexOf(w.status) >= 0) {
      if (!out[w.asset.id]) out[w.asset.id] = [];
      out[w.asset.id].push(w);
    }
  });
  return out;
}

// ------------------------------------------------------------------------------------ row shapes
function _assetRow(a, pred, openWos) {
  var p = _num(a.currentFailureProbability, 0);
  return {
    id: a.id,
    assetId: a.id,
    assetName: a.assetName,
    assetType: a.assetType,
    buildingId: a.building ? a.building.id : null,
    buildingName: a.building ? a.building.shortName : null,
    buildingFullName: a.building ? a.building.name : null,
    zoneId: a.zone ? a.zone.id : null,
    zoneName: a.zone ? a.zone.name : null,
    manufacturer: a.manufacturer || null,
    modelNumber: a.modelNumber || null,
    installationDate: _iso(a.installationDate),
    lastMaintenanceDate: _iso(a.lastMaintenanceDate),
    nextScheduledMaintenanceDate: _iso(a.nextScheduledMaintenanceDate),
    assetCriticality: a.assetCriticality,
    healthScore: _num(a.healthScore),
    currentFailureProbability: p,
    failureProbability: p,
    priorityScore: _num(a.priorityScore, 0),
    status: a.status,
    estimatedPeopleAffected: _num(a.estimatedPeopleAffected, 0),
    accessibilityImpact: a.accessibilityImpact,
    floorsServed: a.floorsServed || null,
    isMonitored: !!a.isMonitored,
    riskLevel: pred ? pred.riskLevel : null,
    predictedFailureMode: pred ? pred.predictedFailureMode : null,
    predictedFailureWindow: pred ? pred.predictedFailureWindow : null,
    confidence: pred ? _num(pred.confidence) : null,
    supportingReportCount: pred ? _num(pred.supportingReportCount, 0) : 0,
    correlationConfidence: pred ? _num(pred.correlationConfidence) : null,
    openWorkOrderCount: openWos ? openWos.length : 0,
    hasOpenWorkOrder: !!(openWos && openWos.length),
  };
}

function _predRow(p) {
  if (!p) return null;
  return {
    id: p.id,
    assetId: p.asset ? p.asset.id : null,
    generatedAt: _iso(p.generatedAt),
    failureProbability: _num(p.failureProbability, 0),
    predictedFailureWindow: p.predictedFailureWindow,
    predictedFailureMode: p.predictedFailureMode,
    confidence: _num(p.confidence),
    anomalyScore: _num(p.anomalyScore),
    riskLevel: p.riskLevel,
    topContributingSignals: p.topContributingSignals || [],
    healthScore: _num(p.healthScore),
    priorityScore: _num(p.priorityScore, 0),
    priorityBreakdown: p.priorityBreakdown || [],
    modelFeatures: p.modelFeatures || {},
    supportingReportCount: _num(p.supportingReportCount, 0),
    correlationConfidence: _num(p.correlationConfidence),
    modelVersion: p.modelVersion,
  };
}

function _recRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    assetId: r.asset ? r.asset.id : null,
    predictionId: r.prediction ? r.prediction.id : null,
    recommendedAction: r.recommendedAction,
    recommendedTimeframe: r.recommendedTimeframe,
    reason: r.reason,
    estimatedInspectionDuration: _num(r.estimatedInspectionDuration),
    priorityScore: _num(r.priorityScore),
    expectedRiskReduction: _num(r.expectedRiskReduction),
    projectedFailureProbability: _num(r.projectedFailureProbability),
    requiredSkill: r.requiredSkill,
  };
}

function _reportRow(r) {
  return {
    id: r.id,
    timestamp: _iso(r.timestamp),
    buildingId: r.building ? r.building.id : null,
    buildingName: r.building ? r.building.shortName : null,
    zoneId: r.zone ? r.zone.id : null,
    zoneName: r.zone ? r.zone.name : null,
    assetId: r.asset ? r.asset.id : null,
    assetName: r.asset ? r.asset.assetName : null,
    description: r.description,
    imageUrl: r.imageUrl || null,
    category: r.category || null,
    severity: r.severity || null,
    status: r.status || 'New',
    confidence: _num(r.confidence),
    probableIssue: r.probableIssue || null,
    duplicateGroupId: r.duplicateGroupId || null,
    duplicateProbability: _num(r.duplicateProbability),
    emergencyFlag: !!r.emergencyFlag,
    reporterType: r.reporterType || null,
    relatedAnomaly: !!r.relatedAnomaly,
    correlationConfidence: _num(r.correlationConfidence),
    triageSummary: r.triageSummary || null,
    isDemoGenerated: !!r.isDemoGenerated,
  };
}

function _historyRow(h) {
  return {
    id: h.id,
    assetId: h.asset ? h.asset.id : null,
    serviceDate: _iso(h.serviceDate),
    maintenanceType: h.maintenanceType,
    failureMode: h.failureMode || null,
    description: h.description,
    downtimeHours: _num(h.downtimeHours),
    repairDurationHours: _num(h.repairDurationHours),
    cost: _num(h.cost),
  };
}

function _woRow(w) {
  return {
    id: w.id,
    title: w.title,
    description: w.description || null,
    assetId: w.asset ? w.asset.id : null,
    assetName: w.asset ? w.asset.assetName : null,
    buildingId: w.building ? w.building.id : null,
    buildingName: w.building ? w.building.shortName : null,
    priority: w.priority,
    status: w.status,
    requiredSkill: w.requiredSkill,
    source: w.source,
    estimatedDuration: _num(w.estimatedDuration),
    createdAt: _iso(w.createdAt),
    assignedCrewId: w.assignedCrew ? w.assignedCrew.id : null,
    assignedCrewName: w.assignedCrew ? w.assignedCrew.name : null,
    priorityScore: _num(w.priorityScore, 0),
    expectedRiskReduction: _num(w.expectedRiskReduction, 0),
    relatedReportId: w.relatedReport ? w.relatedReport.id : null,
    relatedPredictionId: w.relatedPrediction ? w.relatedPrediction.id : null,
    isDemoGenerated: !!w.isDemoGenerated,
  };
}

var WO_INCLUDE = 'this, asset.id, asset.assetName, building.id, building.shortName, assignedCrew.id, assignedCrew.name, relatedReport.id, relatedPrediction.id';
var ASSET_INCLUDE = 'this, building.id, building.shortName, building.name, zone.id, zone.name';
var REPORT_INCLUDE = 'this, building.id, building.shortName, zone.id, zone.name, asset.id, asset.assetName';

function _relatedReportsFor(asset, reports) {
  var cats = CATEGORIES_FOR_TYPE[asset.assetType] || [];
  var bid = asset.building ? asset.building.id : null;
  return reports
    .filter(function (r) {
      if (r.asset && r.asset.id) return r.asset.id === asset.id;
      return bid && r.building && r.building.id === bid && cats.indexOf(r.category) >= 0;
    })
    .sort(function (a, b) {
      return (_ms(b.timestamp) || 0) - (_ms(a.timestamp) || 0);
    });
}

// ------------------------------------------------------------------------------------ API
function ensureInitialized() {
  var count = FailurePrediction.fetchCount({ filter: Filter.eq('isCurrent', true) });
  var ran = false;
  if (!count) {
    IlliniFixTriage.triageAll();
    IlliniFixRiskEngine.recomputeAll();
    ran = true;
    count = FailurePrediction.fetchCount({ filter: Filter.eq('isCurrent', true) });
  }
  return { initialized: true, predictionCount: count, ranRecompute: ran };
}

function getCampusHealth() {
  var buildings = _fetchAll(CampusBuilding, { include: 'this' });
  var assets = _fetchAll(MaintenanceAsset, { include: ASSET_INCLUDE });
  var preds = _indexBy(_currentPredictions(), function (p) {
    return p.asset ? p.asset.id : null;
  });
  var workOrders = _fetchAll(WorkOrder, { include: WO_INCLUDE });
  var openByAsset = _openWorkOrdersByAsset(workOrders);
  var reports = _fetchAll(StudentReport, { include: 'this, building.id' });
  var assetsByBuilding = _groupBy(assets, function (a) {
    return a.building ? a.building.id : null;
  });

  var occNum = 0;
  var occDen = 0;
  var buildingRows = buildings.map(function (b) {
    var h = _num(b.overallHealthScore, 100);
    var occ = _num(b.estimatedDailyOccupancy, 1);
    occNum += h * occ;
    occDen += occ;
    var mine = assetsByBuilding[b.id] || [];
    return {
      id: b.id,
      name: b.name,
      shortName: b.shortName,
      address: b.address,
      latitude: _num(b.latitude),
      longitude: _num(b.longitude),
      estimatedDailyOccupancy: occ,
      criticalityScore: _num(b.criticalityScore),
      accessibilityCriticality: b.accessibilityCriticality,
      overallHealthScore: h,
      healthStatus: b.healthStatus || _statusForHealth(h),
      activeIncidentCount: _num(b.activeIncidentCount, 0),
      highRiskAssetCount: _num(b.highRiskAssetCount, 0),
      criticalAssetCount: _num(b.criticalAssetCount, 0),
      assetCount: mine.length,
    };
  });
  var campus = occDen ? Math.round((occNum / occDen) * 10) / 10 : 100;

  var rows = assets.map(function (a) {
    return _assetRow(a, preds[a.id], openByAsset[a.id]);
  });
  var critical = rows.filter(function (r) {
    return r.status === 'Critical';
  }).length;
  var highRisk = rows.filter(function (r) {
    return r.riskLevel === 'High' || r.riskLevel === 'Critical';
  }).length;
  var predicted = rows.filter(function (r) {
    return r.failureProbability >= 0.5;
  });
  var peopleAtRisk = _sum(predicted, function (r) {
    return r.estimatedPeopleAffected || 0;
  });
  var topRisks = rows
    .filter(function (r) {
      return r.riskLevel !== 'Low' || (r.healthScore !== null && r.healthScore < 90);
    })
    .sort(function (a, b) {
      return b.priorityScore - a.priorityScore;
    })
    .slice(0, 10);
  if (topRisks.length < 5) {
    topRisks = rows
      .sort(function (a, b) {
        return b.priorityScore - a.priorityScore;
      })
      .slice(0, 5);
  }
  var woCounts = { Draft: 0, Scheduled: 0, Assigned: 0, InProgress: 0, Completed: 0, Cancelled: 0 };
  workOrders.forEach(function (w) {
    woCounts[w.status] = (woCounts[w.status] || 0) + 1;
  });
  var catCounts = {};
  var openReports = 0;
  reports.forEach(function (r) {
    if (r.status !== 'Resolved') {
      openReports += 1;
      var c = r.category || 'Other';
      catCounts[c] = (catCounts[c] || 0) + 1;
    }
  });
  var anomalies24h = SensorReading.fetchCount({
    filter: Filter.eq('isAnomaly', true).and(Filter.ge('timestamp', DateTime.now().plusHours(-24))),
  });
  return {
    generatedAt: _iso(DateTime.now()),
    campusHealthScore: campus,
    campusStatus: _statusForHealth(campus),
    criticalAssets: critical,
    highRiskAssets: highRisk,
    predictedFailures7d: predicted.length,
    openReports: openReports,
    activeWorkOrders: woCounts.Draft + woCounts.Scheduled + woCounts.Assigned + woCounts.InProgress,
    peopleAtRisk: peopleAtRisk,
    assetsMonitored: assets.length,
    sensorsOnline: Sensor.fetchCount(),
    anomaliesDetected24h: anomalies24h,
    buildings: buildingRows,
    topRisks: topRisks,
    workOrderStatusCounts: woCounts,
    reportCategoryCounts: catCounts,
  };
}

function getBuildingHealth(buildingId) {
  var foundB = _fetchAll(CampusBuilding, { filter: Filter.eq('id', buildingId), include: 'this', limit: 1 });
  if (!foundB.length) throw new Error('Unknown building ' + buildingId);
  var b = foundB[0];
  var assets = _fetchAll(MaintenanceAsset, { filter: Filter.eq('building.id', buildingId), include: ASSET_INCLUDE });
  var preds = _indexBy(_currentPredictions(), function (p) {
    return p.asset ? p.asset.id : null;
  });
  var workOrders = _fetchAll(WorkOrder, { filter: Filter.eq('building.id', buildingId), include: WO_INCLUDE });
  var openByAsset = _openWorkOrdersByAsset(workOrders);
  var reports = _fetchAll(StudentReport, { filter: Filter.eq('building.id', buildingId), include: REPORT_INCLUDE, order: 'descending(timestamp)' });
  var zones = _fetchAll(CampusZone, { filter: Filter.eq('building.id', buildingId), include: 'this' });
  var rows = assets
    .map(function (a) {
      return _assetRow(a, preds[a.id], openByAsset[a.id]);
    })
    .sort(function (x, y) {
      return y.priorityScore - x.priorityScore;
    });
  var h = _num(b.overallHealthScore, 100);
  return {
    id: b.id,
    name: b.name,
    shortName: b.shortName,
    address: b.address,
    latitude: _num(b.latitude),
    longitude: _num(b.longitude),
    estimatedDailyOccupancy: _num(b.estimatedDailyOccupancy, 0),
    criticalityScore: _num(b.criticalityScore),
    accessibilityCriticality: b.accessibilityCriticality,
    overallHealthScore: h,
    healthStatus: b.healthStatus || _statusForHealth(h),
    activeIncidentCount: _num(b.activeIncidentCount, 0),
    highRiskAssetCount: _num(b.highRiskAssetCount, 0),
    criticalAssetCount: _num(b.criticalAssetCount, 0),
    assets: rows,
    zones: zones.map(function (z) {
      return {
        id: z.id,
        name: z.name,
        floor: _num(z.floor),
        zoneType: z.zoneType,
        estimatedOccupancy: _num(z.estimatedOccupancy, 0),
        requiresAccessibleRoute: !!z.requiresAccessibleRoute,
      };
    }),
    activeReports: reports.filter(function (r) {
      return r.status !== 'Resolved';
    }).length,
    predictedFailures: rows.filter(function (r) {
      return r.failureProbability >= 0.5;
    }).length,
    reports: reports.slice(0, 25).map(_reportRow),
    openWorkOrders: workOrders
      .filter(function (w) {
        return OPEN_WO_STATUSES.indexOf(w.status) >= 0;
      })
      .map(_woRow),
  };
}

function getCriticalAssets() {
  var assets = _fetchAll(MaintenanceAsset, { include: ASSET_INCLUDE });
  var preds = _indexBy(_currentPredictions(), function (p) {
    return p.asset ? p.asset.id : null;
  });
  var openByAsset = _openWorkOrdersByAsset(_fetchAll(WorkOrder, { include: WO_INCLUDE }));
  return assets
    .map(function (a) {
      return _assetRow(a, preds[a.id], openByAsset[a.id]);
    })
    .filter(function (r) {
      return r.status === 'Critical' || r.status === 'Warning' || r.riskLevel === 'High' || r.riskLevel === 'Critical' || r.riskLevel === 'Moderate';
    })
    .sort(function (x, y) {
      return y.priorityScore - x.priorityScore;
    });
}

function getAssets() {
  var assets = _fetchAll(MaintenanceAsset, { include: ASSET_INCLUDE });
  var preds = _indexBy(_currentPredictions(), function (p) {
    return p.asset ? p.asset.id : null;
  });
  var openByAsset = _openWorkOrdersByAsset(_fetchAll(WorkOrder, { include: WO_INCLUDE }));
  return assets
    .map(function (a) {
      return _assetRow(a, preds[a.id], openByAsset[a.id]);
    })
    .sort(function (x, y) {
      return y.priorityScore - x.priorityScore;
    });
}

function getReports(filterName) {
  var rows = _fetchAll(StudentReport, { include: REPORT_INCLUDE, order: 'descending(timestamp)' }).map(_reportRow);
  var f = filterName || 'All';
  return rows.filter(function (r) {
    switch (f) {
      case 'Open':
        return r.status !== 'Resolved';
      case 'Emergency':
        return r.emergencyFlag;
      case 'Correlated':
        return r.relatedAnomaly;
      case 'Duplicates':
        return !!r.duplicateGroupId;
      case 'Resolved':
        return r.status === 'Resolved';
      default:
        return true;
    }
  });
}

function getAssetDetails(assetId) {
  var found = _fetchAll(MaintenanceAsset, {
    filter: Filter.eq('id', assetId),
    include: ASSET_INCLUDE + ', building.estimatedDailyOccupancy, building.overallHealthScore, building.healthStatus, zone.estimatedOccupancy, zone.requiresAccessibleRoute, zone.floor',
    limit: 1,
  });
  if (!found.length) throw new Error('Unknown asset ' + assetId);
  var a = found[0];
  var preds = _fetchAll(FailurePrediction, { filter: Filter.eq('asset.id', assetId).and(Filter.eq('isCurrent', true)), include: 'this, asset.id', limit: 1 });
  var recs = _fetchAll(MaintenanceRecommendation, { filter: Filter.eq('asset.id', assetId).and(Filter.eq('isCurrent', true)), include: 'this, asset.id, prediction.id', limit: 1 });
  var history = _fetchAll(MaintenanceHistory, { filter: Filter.eq('asset.id', assetId), include: 'this, asset.id', order: 'descending(serviceDate)' });
  var reports = _fetchAll(StudentReport, { include: REPORT_INCLUDE });
  var workOrders = _fetchAll(WorkOrder, { filter: Filter.eq('asset.id', assetId), include: WO_INCLUDE, order: 'descending(createdAt)' });
  var scenarios = _fetchAll(SimulationScenario, { filter: Filter.eq('asset.id', assetId), include: 'this, asset.id', order: 'descending(createdAt)', limit: 5 });
  var sensors = _fetchAll(Sensor, { filter: Filter.eq('asset.id', assetId), include: 'this' });
  var siblings = _fetchAll(MaintenanceAsset, {
    filter: Filter.eq('building.id', a.building ? a.building.id : '__none__').and(Filter.eq('assetType', a.assetType)),
    include: 'id, assetName, status, healthScore',
  }).filter(function (s) {
    return s.id !== assetId;
  });
  var open = workOrders.filter(function (w) {
    return OPEN_WO_STATUSES.indexOf(w.status) >= 0;
  });
  var row = _assetRow(a, preds[0], open);
  row.building = a.building
    ? {
        id: a.building.id,
        name: a.building.name,
        shortName: a.building.shortName,
        estimatedDailyOccupancy: _num(a.building.estimatedDailyOccupancy, 0),
        overallHealthScore: _num(a.building.overallHealthScore),
        healthStatus: a.building.healthStatus,
      }
    : null;
  row.zone = a.zone
    ? { id: a.zone.id, name: a.zone.name, floor: _num(a.zone.floor), estimatedOccupancy: _num(a.zone.estimatedOccupancy, 0), requiresAccessibleRoute: !!a.zone.requiresAccessibleRoute }
    : null;
  row.prediction = _predRow(preds[0]);
  row.recommendation = _recRow(recs[0]);
  row.maintenanceHistory = history.map(_historyRow);
  row.relatedReports = _relatedReportsFor(a, reports).map(_reportRow);
  row.workOrders = workOrders.map(_woRow);
  row.openWorkOrders = open.map(_woRow);
  row.scenarios = scenarios.map(function (s) {
    return { id: s.id, scenarioType: s.scenarioType, headline: s.headline, createdAt: _iso(s.createdAt), resultSummary: s.resultSummary };
  });
  row.sensors = sensors.map(function (s) {
    return { id: s.id, name: s.name, sensorType: s.sensorType, unit: s.unit, baselineMean: _num(s.baselineMean), baselineStdDev: _num(s.baselineStdDev), normalMin: _num(s.normalMin), normalMax: _num(s.normalMax), badDirection: _num(s.badDirection, 1) };
  });
  row.alternatives = siblings.map(function (s) {
    return { id: s.id, assetName: s.assetName, status: s.status, healthScore: _num(s.healthScore) };
  });
  return row;
}

function getAssetTelemetry(assetId) {
  var sensors = _fetchAll(Sensor, { filter: Filter.eq('asset.id', assetId), include: 'this' });
  var readings = _fetchAll(SensorReading, {
    filter: Filter.eq('sensor.asset.id', assetId),
    include: 'id, value, timestamp, isAnomaly, anomalyScore, sensor.id',
    order: 'timestamp',
  });
  var bySensor = _groupBy(readings, function (r) {
    return r.sensor ? r.sensor.id : null;
  });
  var series = sensors.map(function (s) {
    var rows = bySensor[s.id] || [];
    var mean = _num(s.baselineMean, 0);
    var sd = _num(s.baselineStdDev, 1) || 1;
    var dir = _num(s.badDirection, 1);
    var points = rows.map(function (r) {
      var v = _num(r.value, 0);
      return { t: _iso(r.timestamp), v: v, z: Math.round(((v - mean) / sd) * 100) / 100, anomaly: !!r.isAnomaly };
    });
    var last24 = points.slice(-24);
    var mean24 = last24.length
      ? _sum(last24, function (p) {
          return p.v;
        }) / last24.length
      : mean;
    var anomalyCount = points.filter(function (p) {
      return p.anomaly;
    }).length;
    var anomalyStartAt = null;
    for (var i = Math.max(0, points.length - 120); i < points.length; i++) {
      if (points[i].anomaly) {
        var run = 0;
        for (var j = i; j < Math.min(points.length, i + 6); j++) if (points[j].anomaly) run++;
        if (run >= 3) {
          anomalyStartAt = points[i].t;
          break;
        }
      }
    }
    return {
      sensorId: s.id,
      name: s.name,
      sensorType: s.sensorType,
      unit: s.unit,
      baselineMean: mean,
      baselineStdDev: sd,
      normalMin: _num(s.normalMin),
      normalMax: _num(s.normalMax),
      badDirection: dir,
      readings: points,
      latestValue: points.length ? points[points.length - 1].v : null,
      mean24h: Math.round(mean24 * 1000) / 1000,
      deviationPct: mean ? Math.round(((mean24 - mean) / mean) * 1000) / 10 : 0,
      anomalyCount: anomalyCount,
      anomalyCount24h: last24.filter(function (p) {
        return p.anomaly;
      }).length,
      anomalyStartAt: anomalyStartAt,
    };
  });
  return { assetId: assetId, sensors: series, readingCount: readings.length, generatedAt: _iso(DateTime.now()) };
}

function getFailurePrediction(assetId) {
  var preds = _fetchAll(FailurePrediction, { filter: Filter.eq('asset.id', assetId).and(Filter.eq('isCurrent', true)), include: 'this, asset.id', limit: 1 });
  var recs = _fetchAll(MaintenanceRecommendation, { filter: Filter.eq('asset.id', assetId).and(Filter.eq('isCurrent', true)), include: 'this, asset.id, prediction.id', limit: 1 });
  return { assetId: assetId, prediction: _predRow(preds[0]), recommendation: _recRow(recs[0]) };
}

function getRelatedReports(assetId) {
  var found = _fetchAll(MaintenanceAsset, { filter: Filter.eq('id', assetId), include: 'this, building.id', limit: 1 });
  if (!found.length) throw new Error('Unknown asset ' + assetId);
  var reports = _fetchAll(StudentReport, { include: REPORT_INCLUDE });
  return _relatedReportsFor(found[0], reports).map(_reportRow);
}

function getMaintenanceHistory(assetId) {
  return _fetchAll(MaintenanceHistory, { filter: Filter.eq('asset.id', assetId), include: 'this, asset.id', order: 'descending(serviceDate)' }).map(_historyRow);
}

function explainRisk(assetId) {
  var d = getAssetDetails(assetId);
  var pred = d.prediction;
  var rec = d.recommendation;
  var features = pred && pred.modelFeatures ? pred.modelFeatures.features || {} : {};
  var historyMatch = null;
  if (pred) {
    for (var i = 0; i < d.maintenanceHistory.length; i++) {
      if (d.maintenanceHistory[i].failureMode === pred.predictedFailureMode) {
        historyMatch = d.maintenanceHistory[i];
        break;
      }
    }
  }
  var weekAgo = _ms(DateTime.now()) - 7 * 86400000;
  var supporting = d.relatedReports.filter(function (r) {
    return r.status !== 'Resolved' && (_ms(r.timestamp) || 0) >= weekAgo;
  });
  return {
    assetId: d.id,
    assetName: d.assetName,
    assetType: d.assetType,
    buildingName: d.buildingName,
    buildingFullName: d.buildingFullName,
    status: d.status,
    healthScore: d.healthScore,
    prediction: pred
      ? {
          failureProbability: pred.failureProbability,
          riskLevel: pred.riskLevel,
          predictedFailureWindow: pred.predictedFailureWindow,
          predictedFailureMode: pred.predictedFailureMode,
          confidence: pred.confidence,
          anomalyScore: pred.anomalyScore,
          generatedAt: pred.generatedAt,
          modelVersion: pred.modelVersion,
        }
      : { failureProbability: d.failureProbability, riskLevel: d.riskLevel, predictedFailureWindow: null, predictedFailureMode: null, confidence: null, anomalyScore: null, generatedAt: null, modelVersion: null },
    evidence: {
      signals: pred ? pred.topContributingSignals : [],
      supportingReports: supporting,
      historyMatch: historyMatch,
      features: features,
      sensors: pred && pred.modelFeatures ? pred.modelFeatures.sensors || [] : [],
      anomalyStartAt: pred && pred.modelFeatures ? pred.modelFeatures.anomalyStartAt || null : null,
    },
    impact: {
      estimatedPeopleAffected: d.estimatedPeopleAffected,
      accessibilityImpact: d.accessibilityImpact,
      assetCriticality: d.assetCriticality,
      floorsServed: d.floorsServed,
      buildingHealth: d.building ? d.building.overallHealthScore : null,
      buildingOccupancy: d.building ? d.building.estimatedDailyOccupancy : null,
      alternatives: d.alternatives,
      zoneName: d.zoneName,
    },
    recommendation: rec,
    priority: { score: d.priorityScore, breakdown: pred ? pred.priorityBreakdown : [] },
    correlationConfidence: d.correlationConfidence,
    supportingReportCount: supporting.length,
    openWorkOrders: d.openWorkOrders,
  };
}

function getWorkOrders(filterName) {
  var rows = _fetchAll(WorkOrder, { include: WO_INCLUDE, order: 'descending(createdAt)' }).map(_woRow);
  var f = filterName || 'All';
  return rows.filter(function (w) {
    switch (f) {
      case 'Critical':
        return w.priority === 'Critical' || w.priority === 'High';
      case 'PredictedFailure':
        return w.source === 'PredictedFailure';
      case 'StudentReport':
        return w.source === 'StudentReport';
      case 'Unassigned':
        return !w.assignedCrewId && OPEN_WO_STATUSES.indexOf(w.status) >= 0;
      case 'InProgress':
        return w.status === 'InProgress' || w.status === 'Assigned';
      case 'Completed':
        return w.status === 'Completed';
      case 'Open':
        return OPEN_WO_STATUSES.indexOf(w.status) >= 0;
      default:
        return true;
    }
  });
}

function getAvailableCrews() {
  var crews = _fetchAll(MaintenanceCrew, { include: 'this, currentBuilding.id, currentBuilding.shortName, currentBuilding.name' });
  var plans = _fetchAll(MaintenancePlan, { filter: Filter.eq('isCurrent', true), include: 'this', limit: 1 });
  var planCrews = {};
  if (plans.length && plans[0].summary && plans[0].summary.crews) {
    plans[0].summary.crews.forEach(function (c) {
      planCrews[c.crewId] = c;
    });
  }
  var workOrders = _fetchAll(WorkOrder, { include: WO_INCLUDE });
  return crews.map(function (c) {
    var planned = planCrews[c.id];
    var mine = workOrders.filter(function (w) {
      return w.assignedCrew && w.assignedCrew.id === c.id && OPEN_WO_STATUSES.indexOf(w.status) >= 0;
    });
    return {
      id: c.id,
      name: c.name,
      skills: c.skills || [],
      currentBuildingId: c.currentBuilding ? c.currentBuilding.id : null,
      currentBuildingName: c.currentBuilding ? c.currentBuilding.shortName : null,
      shiftStart: c.shiftStart,
      shiftEnd: c.shiftEnd,
      availableHours: _num(c.availableHours, 8),
      status: c.status,
      crewSize: _num(c.crewSize, 2),
      leadName: c.leadName,
      assignedWorkOrders: mine.map(_woRow),
      plannedJobs: planned ? planned.jobs : [],
      hoursUsed: planned ? planned.hoursUsed : 0,
    };
  });
}

function getRiskTrend() {
  var anomalies = _fetchAll(SensorReading, { filter: Filter.eq('isAnomaly', true), include: 'timestamp, sensor.asset.id' });
  var perDay = {};
  anomalies.forEach(function (r) {
    var day = String(r.timestamp).slice(0, 10);
    var aid = r.sensor && r.sensor.asset ? r.sensor.asset.id : 'unknown';
    if (!perDay[day]) perDay[day] = {};
    perDay[day][aid] = (perDay[day][aid] || 0) + 1;
  });
  var days = Object.keys(perDay).sort();
  var now = _ms(DateTime.now());
  var out = [];
  for (var i = 6; i >= 0; i--) {
    var day = String(DateTime.fromMillis(now - i * 86400000)).slice(0, 10);
    var counts = perDay[day] || {};
    var elevated = 0;
    var high = 0;
    var critical = 0;
    var total = 0;
    Object.keys(counts).forEach(function (aid) {
      var n = counts[aid];
      total += n;
      if (n >= 3) elevated++;
      if (n >= 10) high++;
      if (n >= 24) critical++;
    });
    out.push({ day: day, anomalies: total, elevatedAssets: elevated, highRiskAssets: high, criticalAssets: critical });
  }
  return { days: out, source: 'Derived from SensorReading anomalies (|z| > 2.5) per asset per day', coveredDays: days.length };
}

function getReportClusters() {
  var reports = _fetchAll(StudentReport, { include: REPORT_INCLUDE, order: 'timestamp' }).map(_reportRow);
  var groups = _groupBy(reports, function (r) {
    return r.duplicateGroupId;
  });
  return Object.keys(groups)
    .map(function (gid) {
      var members = groups[gid];
      var conf = 0;
      members.forEach(function (r) {
        conf = Math.max(conf, r.duplicateProbability || 0);
      });
      var issues = {};
      members.forEach(function (r) {
        issues[r.probableIssue || 'Unknown'] = (issues[r.probableIssue || 'Unknown'] || 0) + 1;
      });
      var likely = Object.keys(issues).sort(function (a, b) {
        return issues[b] - issues[a];
      })[0];
      return {
        clusterId: gid,
        size: members.length,
        confidence: conf,
        likelyIssue: likely,
        category: members[0].category,
        buildingName: members[0].buildingName,
        buildingId: members[0].buildingId,
        zoneName: members[0].zoneName,
        firstReportedAt: members[0].timestamp,
        lastReportedAt: members[members.length - 1].timestamp,
        primary: members[0],
        reports: members,
        assetId: members[0].assetId,
        assetName: members[0].assetName,
      };
    })
    .sort(function (a, b) {
      return b.size - a.size;
    });
}

function getHighRiskWithoutWorkOrder() {
  return getCriticalAssets().filter(function (r) {
    return r.failureProbability >= 0.5 && !r.hasOpenWorkOrder;
  });
}

function getAnalyticsSummary() {
  var assets = _fetchAll(MaintenanceAsset, { include: ASSET_INCLUDE });
  var preds = _indexBy(_currentPredictions(), function (p) {
    return p.asset ? p.asset.id : null;
  });
  var workOrders = _fetchAll(WorkOrder, { include: WO_INCLUDE });
  var openByAsset = _openWorkOrdersByAsset(workOrders);
  var reports = _fetchAll(StudentReport, { include: REPORT_INCLUDE });
  var history = _fetchAll(MaintenanceHistory, { include: 'this, asset.id' });
  var rows = assets.map(function (a) {
    return _assetRow(a, preds[a.id], openByAsset[a.id]);
  });
  var predicted = rows.filter(function (r) {
    return r.failureProbability >= 0.5;
  });
  var downtimeByAsset = {};
  history.forEach(function (h) {
    if (h.asset && h.downtimeHours && ['Corrective', 'Emergency', 'Replacement'].indexOf(h.maintenanceType) >= 0) {
      if (!downtimeByAsset[h.asset.id]) downtimeByAsset[h.asset.id] = [];
      downtimeByAsset[h.asset.id].push(_num(h.downtimeHours, 0));
    }
  });
  var downtimeAvoided = 0;
  predicted.forEach(function (r) {
    var hs = downtimeByAsset[r.id];
    var avg = hs && hs.length
      ? _sum(hs, function (x) {
          return x;
        }) / hs.length
      : DEFAULT_DOWNTIME_H[r.assetType] || 12;
    downtimeAvoided += r.failureProbability * avg;
  });
  var avgHealth = rows.length
    ? _sum(rows, function (r) {
        return r.healthScore === null ? 100 : r.healthScore;
      }) / rows.length
    : 100;
  var classified = reports.filter(function (r) {
    return r.category && r.confidence !== null && r.confidence !== undefined;
  }).length;
  var clusters = _groupBy(reports, function (r) {
    return r.duplicateGroupId;
  });
  var consolidated = 0;
  Object.keys(clusters).forEach(function (k) {
    consolidated += Math.max(0, clusters[k].length - 1);
  });
  var correlated = reports.filter(function (r) {
    return r.relatedAnomaly;
  }).length;
  var anomalies = SensorReading.fetchCount({ filter: Filter.eq('isAnomaly', true) });
  var byType = {};
  rows.forEach(function (r) {
    if (!byType[r.assetType]) byType[r.assetType] = { assetType: r.assetType, count: 0, healthSum: 0, atRisk: 0 };
    byType[r.assetType].count++;
    byType[r.assetType].healthSum += r.healthScore === null ? 100 : r.healthScore;
    if (r.failureProbability >= 0.5) byType[r.assetType].atRisk++;
  });
  return {
    generatedAt: _iso(DateTime.now()),
    assetsMonitored: rows.length,
    sensorsMonitored: Sensor.fetchCount(),
    anomaliesDetected: anomalies,
    predictedFailuresDetected: predicted.length,
    incidentsPreventedSimulated: predicted.length,
    averageAssetHealth: Math.round(avgHealth * 10) / 10,
    reportsAutoClassified: classified,
    reportsTotal: reports.length,
    duplicateReportsConsolidated: consolidated,
    incidentClusters: Object.keys(clusters).length,
    humanMachineCorrelations: correlated,
    highRiskWithoutWorkOrder: predicted.filter(function (r) {
      return !r.hasOpenWorkOrder;
    }).length,
    projectedDowntimeAvoidedHours: Math.round(downtimeAvoided * 10) / 10,
    projectedDailyUsersProtected: _sum(predicted, function (r) {
      return r.estimatedPeopleAffected || 0;
    }),
    workOrdersFromPredictions: workOrders.filter(function (w) {
      return w.source === 'PredictedFailure';
    }).length,
    healthByAssetType: Object.keys(byType).map(function (k) {
      var t = byType[k];
      return { assetType: t.assetType, count: t.count, averageHealth: Math.round((t.healthSum / t.count) * 10) / 10, atRisk: t.atRisk };
    }),
    statusDistribution: ['Healthy', 'Monitor', 'Warning', 'Critical', 'Offline', 'Maintenance'].map(function (s) {
      return {
        status: s,
        count: rows.filter(function (r) {
          return r.status === s;
        }).length,
      };
    }),
    disclaimer: 'Simulated demo data — projected benefits are model estimates, not realised university savings.',
  };
}

function createDraftWorkOrder(assetId) {
  var d = getAssetDetails(assetId);
  var pred = d.prediction;
  var rec = d.recommendation;
  var now = DateTime.now();
  var id = 'wo_' + assetId.slice(4) + '_' + _ms(now);
  var riskLevel = pred ? pred.riskLevel : 'Low';
  var mode = pred ? pred.predictedFailureMode : 'Inspection';
  var reasonBits = pred
    ? pred.topContributingSignals.slice(0, 4).map(function (s) {
        return s.signal + ' ' + String(s.detail).split(';')[0];
      })
    : [];
  var row = {
    id: id,
    asset: { id: assetId },
    building: d.buildingId ? { id: d.buildingId } : null,
    title: 'Inspect ' + d.assetName + ' — ' + mode,
    description:
      (rec ? rec.recommendedAction : 'Inspect asset') +
      '. Reason: ' +
      (reasonBits.length ? reasonBits.join('; ') : 'routine inspection') +
      (d.supportingReportCount ? ' and ' + d.supportingReportCount + ' related human report(s)' : '') +
      '.',
    priority: PRIORITY_FOR_RISK[riskLevel] || 'Medium',
    status: 'Draft',
    requiredSkill: rec ? rec.requiredSkill : 'General',
    estimatedDuration: rec ? rec.estimatedInspectionDuration || 60 : 60,
    createdAt: now,
    source: 'PredictedFailure',
    priorityScore: d.priorityScore,
    expectedRiskReduction: rec ? rec.expectedRiskReduction || 0 : 0,
    relatedPrediction: pred ? { id: pred.id } : null,
    isDemoGenerated: true,
  };
  WorkOrder.make(row).create();
  var created = _fetchAll(WorkOrder, { filter: Filter.eq('id', id), include: WO_INCLUDE, limit: 1 });
  return created.length ? _woRow(created[0]) : row;
}

function assignCrew(workOrderId, crewId) {
  WorkOrder.make({ id: workOrderId, assignedCrew: { id: crewId }, status: 'Assigned' }).merge();
  MaintenanceCrew.make({ id: crewId, status: 'Assigned' }).merge();
  var rows = _fetchAll(WorkOrder, { filter: Filter.eq('id', workOrderId), include: WO_INCLUDE, limit: 1 });
  return rows.length ? _woRow(rows[0]) : null;
}

function updateWorkOrderStatus(workOrderId, status) {
  WorkOrder.make({ id: workOrderId, status: status }).merge();
  var rows = _fetchAll(WorkOrder, { filter: Filter.eq('id', workOrderId), include: WO_INCLUDE, limit: 1 });
  return rows.length ? _woRow(rows[0]) : null;
}
