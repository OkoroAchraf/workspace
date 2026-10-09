/*
 * Copyright 2009-2025 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { ReactElement } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  lastName: string;
  firstName: string;
}

export interface UserGroup {
  id: string;
  name: string;
  description: string;
}

export interface SnackbarMessage {
  message: ReactElement;
  key: number;
  severity?: 'success' | 'info' | 'warning' | 'error';
  error?: boolean;
}

// ---------------------------------------------------------------------------------------------
// IlliniFix domain — shapes returned by the IlliniFixOps / IlliniFix* backend services
// ---------------------------------------------------------------------------------------------

export type AssetStatus = 'Healthy' | 'Monitor' | 'Warning' | 'Critical' | 'Offline' | 'Maintenance';
export type HealthStatus = 'Healthy' | 'Monitor' | 'Warning' | 'Critical';
export type RiskLevel = 'Low' | 'Moderate' | 'High' | 'Critical';
export type AssetType =
  | 'Elevator'
  | 'HVAC'
  | 'Pump'
  | 'Boiler'
  | 'ElectricalPanel'
  | 'Generator'
  | 'WaterSystem'
  | 'LightingSystem'
  | 'DoorAccessSystem'
  | 'FireSafetyEquipment';
export type ReportCategory = 'HVAC' | 'Plumbing' | 'Electrical' | 'Elevator' | 'Structural' | 'Lighting' | 'General' | 'Other';
export type ReportSeverity = 'Low' | 'Medium' | 'High' | 'Critical';
export type ReportStatus = 'New' | 'Triaged' | 'Linked' | 'InProgress' | 'Resolved';
export type WorkOrderStatus = 'Draft' | 'Scheduled' | 'Assigned' | 'InProgress' | 'Completed' | 'Cancelled';
export type WorkOrderPriority = 'Low' | 'Medium' | 'High' | 'Critical';
export type WorkOrderSource = 'StudentReport' | 'PredictedFailure' | 'Manual' | 'PreventiveMaintenance';
export type CrewSkill = 'Electrical' | 'Mechanical' | 'HVAC' | 'Plumbing' | 'Elevator' | 'General';
export type ImpactLevel = 'None' | 'Low' | 'Moderate' | 'High' | 'Critical';

export interface BuildingSummary {
  id: string;
  name: string;
  shortName: string;
  address?: string;
  latitude: number | null;
  longitude: number | null;
  estimatedDailyOccupancy: number;
  criticalityScore: number | null;
  accessibilityCriticality: ImpactLevel | null;
  overallHealthScore: number;
  healthStatus: HealthStatus;
  activeIncidentCount: number;
  highRiskAssetCount: number;
  criticalAssetCount: number;
  assetCount?: number;
}

export interface ZoneRow {
  id: string;
  name: string;
  floor: number | null;
  zoneType: string;
  estimatedOccupancy: number;
  requiresAccessibleRoute: boolean;
}

export interface AssetRow {
  id: string;
  assetId: string;
  assetName: string;
  assetType: AssetType;
  buildingId: string | null;
  buildingName: string | null;
  buildingFullName: string | null;
  zoneId: string | null;
  zoneName: string | null;
  manufacturer: string | null;
  modelNumber: string | null;
  installationDate: string | null;
  lastMaintenanceDate: string | null;
  nextScheduledMaintenanceDate: string | null;
  assetCriticality: ImpactLevel;
  healthScore: number | null;
  currentFailureProbability: number;
  failureProbability: number;
  priorityScore: number;
  status: AssetStatus;
  estimatedPeopleAffected: number;
  accessibilityImpact: ImpactLevel;
  floorsServed: string | null;
  isMonitored: boolean;
  riskLevel: RiskLevel | null;
  predictedFailureMode: string | null;
  predictedFailureWindow: string | null;
  confidence: number | null;
  supportingReportCount: number;
  correlationConfidence: number | null;
  openWorkOrderCount: number;
  hasOpenWorkOrder: boolean;
}

export interface ContributingSignal {
  signal: string;
  kind: 'sensor' | 'reports' | 'history' | 'trend' | 'overdue' | string;
  detail: string;
  contribution: number;
}

export interface PriorityFactor {
  factor: string;
  weight: number;
  value: number;
  points: number;
  detail: string;
}

export interface ModelFeatures {
  A: number;
  T: number;
  R: number;
  H: number;
  O: number;
  logit: number;
  daysOverdue: number;
  abnormalSensors: number;
}

export interface SensorStat {
  sensorId: string;
  name: string;
  sensorType: string;
  unit: string;
  baselineMean: number;
  baselineStdDev: number;
  badDirection: number;
  latestValue: number;
  mean24h: number;
  deviationPct: number;
  zBad24h: number;
  severity: number;
  anomalies24h: number;
  anomaliesTotal: number;
  trendSdPerDay: number;
  trend: number;
  risingDays: number;
  anomalyStartAt: string | null;
  readingCount: number;
}

export interface Prediction {
  id: string;
  assetId: string | null;
  generatedAt: string | null;
  failureProbability: number;
  predictedFailureWindow: string | null;
  predictedFailureMode: string | null;
  confidence: number | null;
  anomalyScore: number | null;
  riskLevel: RiskLevel;
  topContributingSignals: ContributingSignal[];
  healthScore: number | null;
  priorityScore: number;
  priorityBreakdown: PriorityFactor[];
  modelFeatures: { features?: ModelFeatures; sensors?: SensorStat[]; anomalyStartAt?: string | null; relatedReportIds?: string[] };
  supportingReportCount: number;
  correlationConfidence: number | null;
  modelVersion: string | null;
}

export interface Recommendation {
  id: string;
  assetId: string | null;
  predictionId: string | null;
  recommendedAction: string;
  recommendedTimeframe: string | null;
  reason: string | null;
  estimatedInspectionDuration: number | null;
  priorityScore: number | null;
  expectedRiskReduction: number | null;
  projectedFailureProbability: number | null;
  requiredSkill: CrewSkill | null;
}

export interface TriageSummary {
  matchedKeywords?: string[];
  candidateAssets?: { id: string; name: string; failureProbability: number | null }[];
  duplicateMatches?: { reportId: string; similarity: number; description: string }[];
  relatedReportIds?: string[];
  classifier?: string;
  emergencyWords?: string[];
}

export interface ReportRow {
  id: string;
  timestamp: string | null;
  buildingId: string | null;
  buildingName: string | null;
  zoneId: string | null;
  zoneName: string | null;
  assetId: string | null;
  assetName: string | null;
  description: string;
  imageUrl: string | null;
  category: ReportCategory | null;
  severity: ReportSeverity | null;
  status: ReportStatus;
  confidence: number | null;
  probableIssue: string | null;
  duplicateGroupId: string | null;
  duplicateProbability: number | null;
  emergencyFlag: boolean;
  reporterType: string | null;
  relatedAnomaly: boolean;
  correlationConfidence: number | null;
  triageSummary: TriageSummary | null;
  isDemoGenerated: boolean;
}

export interface HistoryRow {
  id: string;
  assetId: string | null;
  serviceDate: string | null;
  maintenanceType: string;
  failureMode: string | null;
  description: string;
  downtimeHours: number | null;
  repairDurationHours: number | null;
  cost: number | null;
}

export interface WorkOrderRow {
  id: string;
  title: string;
  description: string | null;
  assetId: string | null;
  assetName: string | null;
  buildingId: string | null;
  buildingName: string | null;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  requiredSkill: CrewSkill;
  source: WorkOrderSource;
  estimatedDuration: number | null;
  createdAt: string | null;
  assignedCrewId: string | null;
  assignedCrewName: string | null;
  priorityScore: number;
  expectedRiskReduction: number;
  relatedReportId: string | null;
  relatedPredictionId: string | null;
  isDemoGenerated: boolean;
}

export interface ScenarioSummary {
  id: string;
  scenarioType: string;
  headline: string | null;
  createdAt: string | null;
  resultSummary: unknown;
}

export interface SensorMeta {
  id: string;
  name: string;
  sensorType: string;
  unit: string;
  baselineMean: number | null;
  baselineStdDev: number | null;
  normalMin: number | null;
  normalMax: number | null;
  badDirection: number;
}

export interface AssetDetails extends AssetRow {
  building: {
    id: string;
    name: string;
    shortName: string;
    estimatedDailyOccupancy: number;
    overallHealthScore: number | null;
    healthStatus: HealthStatus | null;
  } | null;
  zone: { id: string; name: string; floor: number | null; estimatedOccupancy: number; requiresAccessibleRoute: boolean } | null;
  prediction: Prediction | null;
  recommendation: Recommendation | null;
  maintenanceHistory: HistoryRow[];
  relatedReports: ReportRow[];
  workOrders: WorkOrderRow[];
  openWorkOrders: WorkOrderRow[];
  scenarios: ScenarioSummary[];
  sensors: SensorMeta[];
  alternatives: { id: string; assetName: string; status: AssetStatus; healthScore: number | null }[];
}

export interface CampusHealth {
  generatedAt: string;
  campusHealthScore: number;
  campusStatus: HealthStatus;
  criticalAssets: number;
  highRiskAssets: number;
  predictedFailures7d: number;
  openReports: number;
  activeWorkOrders: number;
  peopleAtRisk: number;
  assetsMonitored: number;
  sensorsOnline: number;
  anomaliesDetected24h: number;
  buildings: BuildingSummary[];
  topRisks: AssetRow[];
  workOrderStatusCounts: Record<WorkOrderStatus, number>;
  reportCategoryCounts: Record<string, number>;
}

export interface BuildingHealth extends BuildingSummary {
  assets: AssetRow[];
  zones: ZoneRow[];
  activeReports: number;
  predictedFailures: number;
  reports: ReportRow[];
  openWorkOrders: WorkOrderRow[];
}

export interface TelemetryPoint {
  t: string;
  v: number;
  z: number;
  anomaly: boolean;
}

export interface SensorSeries {
  sensorId: string;
  name: string;
  sensorType: string;
  unit: string;
  baselineMean: number;
  baselineStdDev: number;
  normalMin: number | null;
  normalMax: number | null;
  badDirection: number;
  readings: TelemetryPoint[];
  latestValue: number | null;
  mean24h: number;
  deviationPct: number;
  anomalyCount: number;
  anomalyCount24h: number;
  anomalyStartAt: string | null;
}

export interface AssetTelemetry {
  assetId: string;
  sensors: SensorSeries[];
  readingCount: number;
  generatedAt: string;
}

export interface RiskExplanation {
  assetId: string;
  assetName: string;
  assetType: AssetType;
  buildingName: string | null;
  buildingFullName: string | null;
  status: AssetStatus;
  healthScore: number | null;
  prediction: {
    failureProbability: number;
    riskLevel: RiskLevel | null;
    predictedFailureWindow: string | null;
    predictedFailureMode: string | null;
    confidence: number | null;
    anomalyScore: number | null;
    generatedAt: string | null;
    modelVersion: string | null;
  };
  evidence: {
    signals: ContributingSignal[];
    supportingReports: ReportRow[];
    historyMatch: HistoryRow | null;
    features: Partial<ModelFeatures>;
    sensors: SensorStat[];
    anomalyStartAt: string | null;
  };
  impact: {
    estimatedPeopleAffected: number;
    accessibilityImpact: ImpactLevel;
    assetCriticality: ImpactLevel;
    floorsServed: string | null;
    buildingHealth: number | null;
    buildingOccupancy: number | null;
    alternatives: { id: string; assetName: string; status: AssetStatus; healthScore: number | null }[];
    zoneName: string | null;
  };
  recommendation: Recommendation | null;
  priority: { score: number; breakdown: PriorityFactor[] };
  correlationConfidence: number | null;
  supportingReportCount: number;
  openWorkOrders: WorkOrderRow[];
}

export interface PlanJob {
  workOrderId: string;
  title: string;
  priority: WorkOrderPriority;
  requiredSkill: CrewSkill;
  estimatedDuration: number;
  priorityScore: number;
  expectedRiskReduction: number;
  source: WorkOrderSource;
  assetId: string | null;
  assetName: string | null;
  buildingId: string | null;
  buildingName: string | null;
  sequence: number;
  startLabel: string;
  endLabel: string;
  travelTimeMinutes: number;
  riskReduction: number;
  valuePerHour: number;
}

export interface CrewRow {
  id: string;
  name: string;
  skills: CrewSkill[];
  currentBuildingId: string | null;
  currentBuildingName: string | null;
  shiftStart: string;
  shiftEnd: string;
  availableHours: number;
  status: string;
  crewSize: number;
  leadName: string | null;
  assignedWorkOrders: WorkOrderRow[];
  plannedJobs: PlanJob[];
  hoursUsed: number;
}

export interface CrewPlan {
  crewId: string;
  crewName: string;
  skills: CrewSkill[];
  leadName: string | null;
  startBuilding: string | null;
  shiftStart: string;
  shiftEnd: string;
  hoursUsed: number;
  hoursRemaining: number;
  jobs: PlanJob[];
}

export interface UnscheduledJob {
  workOrderId: string;
  title: string;
  priority: WorkOrderPriority;
  requiredSkill: CrewSkill;
  estimatedDuration: number;
  priorityScore: number;
  expectedRiskReduction: number;
  source: WorkOrderSource;
  assetId: string | null;
  assetName: string | null;
  buildingId: string | null;
  buildingName: string | null;
  reason: string;
}

export interface MaintenancePlanResult {
  planId?: string;
  method: string;
  methodDescription: string;
  shiftHours: number;
  crewCount: number;
  workOrderCount: number;
  scheduledCount: number;
  unscheduledCount: number;
  totalRiskReduction: number;
  currentCampusHealth: number;
  projectedCampusHealth: number;
  currentCriticalAssets: number;
  projectedCriticalAssets: number;
  crews: CrewPlan[];
  unscheduled: UnscheduledJob[];
  generatedAt: string;
  createdAt?: string;
}

export interface RiskTrendDay {
  day: string;
  anomalies: number;
  elevatedAssets: number;
  highRiskAssets: number;
  criticalAssets: number;
}

export interface RiskTrend {
  days: RiskTrendDay[];
  source: string;
  coveredDays: number;
}

export interface ReportCluster {
  clusterId: string;
  size: number;
  confidence: number;
  likelyIssue: string;
  category: ReportCategory | null;
  buildingName: string | null;
  buildingId: string | null;
  zoneName: string | null;
  firstReportedAt: string | null;
  lastReportedAt: string | null;
  primary: ReportRow;
  reports: ReportRow[];
  assetId: string | null;
  assetName: string | null;
}

export interface AnalyticsSummary {
  generatedAt: string;
  assetsMonitored: number;
  sensorsMonitored: number;
  anomaliesDetected: number;
  predictedFailuresDetected: number;
  incidentsPreventedSimulated: number;
  averageAssetHealth: number;
  reportsAutoClassified: number;
  reportsTotal: number;
  duplicateReportsConsolidated: number;
  incidentClusters: number;
  humanMachineCorrelations: number;
  highRiskWithoutWorkOrder: number;
  projectedDowntimeAvoidedHours: number;
  projectedDailyUsersProtected: number;
  workOrdersFromPredictions: number;
  healthByAssetType: { assetType: AssetType; count: number; averageHealth: number; atRisk: number }[];
  statusDistribution: { status: AssetStatus; count: number }[];
  disclaimer: string;
}

export interface TriageResult {
  reportId: string;
  description: string;
  category: ReportCategory;
  severity: ReportSeverity;
  probableIssue: string;
  confidence: number;
  status: ReportStatus;
  building: { id: string; name: string | null } | null;
  likelyAsset: { id: string; name: string; assetType: AssetType; failureProbability: number } | null;
  relatedAnomaly: boolean;
  failureProbability: number | null;
  correlationConfidence: number;
  relatedReports: string[];
  relatedReportCount: number;
  duplicateGroupId: string | null;
  duplicateProbability: number;
  duplicateCount: number;
  emergencyFlag: boolean;
  emergencyGuidance: string | null;
  recommendedResponse: string;
  matchedKeywords: string[];
  predictedFailureMode: string | null;
}

export interface CorrelationResult {
  assetId: string;
  assetName: string;
  buildingName: string | null;
  machineSignals: { signal: string; detail: string; severity: number; anomalies24h: number }[];
  humanSignals: {
    reportId: string;
    timestamp: string;
    description: string;
    severity: ReportSeverity | null;
    reporterType: string | null;
    correlationConfidence: number | null;
  }[];
  historicalSignal: { serviceDate: string; failureMode: string; description: string } | null;
  confidence: number;
  failureProbability: number;
  probableFailure: string | null;
  verdict: string;
  features: Partial<ModelFeatures>;
}

export interface SimulationKpis {
  status?: string;
  failureProbability?: number;
  assetHealth?: number | null;
  assetStatus?: string;
  buildingHealth?: number | null;
  campusHealth: number;
  criticalAssets: number;
  peopleAtRisk: number;
}

export interface FailureSimulation {
  scenarioId: string | null;
  headline: string;
  assetId: string;
  assetName: string;
  assetType: AssetType;
  buildingId: string | null;
  buildingName: string | null;
  buildingShortName: string | null;
  zoneName: string | null;
  before: SimulationKpis;
  after: SimulationKpis;
  impacts: {
    peopleAffected: number;
    accessibilityImpact: ImpactLevel;
    impactLevel: 'HIGH' | 'MODERATE' | 'LOW';
    alternativeUtilizationIncreasePct: number | null;
    alternativesCount: number;
    alternativeNames: string[];
    impactedFloors: string | null;
    estimatedDowntimeHours: number;
    maintenancePriority: string;
    requiresAccessibleRoute: boolean | null;
  };
  generatedAt: string;
  scenarioType: 'AssetFailure';
}

export interface RepairSimulation {
  scenarioId: string | null;
  headline: string;
  assetId: string;
  assetName: string;
  buildingName: string | null;
  buildingShortName: string | null;
  before: SimulationKpis;
  after: SimulationKpis;
  deltas: { campusHealth: number; criticalAssets: number; peopleAtRisk: number; failureProbability: number };
  recommendedAction: string | null;
  estimatedInspectionDuration: number | null;
  generatedAt: string;
  scenarioType: 'AssetRepair';
}

export interface ScenarioRow {
  id: string;
  scenarioType: string;
  headline: string | null;
  createdAt: string;
  assetId: string | null;
  assetName: string | null;
  buildingShortName: string | null;
  resultSummary: FailureSimulation | RepairSimulation | null;
}

export interface AgentAction {
  label: string;
  action: 'openAsset' | 'simulateFailure' | 'createWorkOrder' | 'openPlanner' | 'ask' | string;
  assetId: string | null;
  question?: string;
}

export interface AgentAnswer {
  question: string;
  intent: string;
  answer: string;
  draft: string;
  facts: Record<string, unknown>;
  citations: { label: string; value: string }[];
  suggestedActions: AgentAction[];
  usedLlm: boolean;
  disclaimer: string;
}

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  answer?: AgentAnswer;
  pending?: boolean;
  error?: string;
}

export interface DemoState {
  elevatorDegraded: boolean;
  hvacDegraded: boolean;
  elevatorPrediction: { failureProbability: number; riskLevel: RiskLevel; predictedFailureMode: string } | null;
  hvacPrediction: { failureProbability: number; riskLevel: RiskLevel; predictedFailureMode: string } | null;
  demoReports: number;
  demoWorkOrders: number;
  scenarios: number;
  planExists: boolean;
  telemetryEndsAt: string | null;
  message?: string;
}

export interface InjectResult {
  assetId: string;
  telemetry: { assetId: string; sensors: number; readingsWritten: number; telemetryEndsAt: string };
  prediction: { failureProbability: number; riskLevel: RiskLevel; healthScore: number; predictedFailureMode: string };
  message: string;
}

export interface RecomputeSummary {
  assetsScored: number;
  campusHealth: number;
  durationMs: number;
  generatedAt: string;
}

export interface InitStatus {
  initialized: boolean;
  predictionCount: number;
  ranRecompute: boolean;
}

export interface C3FetchResult<T> {
  objs: T[];
  count?: number;
}

export interface BuildingRef {
  id: string;
  name: string;
  shortName: string;
}

export interface ZoneRef {
  id: string;
  name: string;
  floor: number | null;
  building?: { id: string };
}
