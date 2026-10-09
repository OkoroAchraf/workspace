/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { c3Action } from '@/c3Action';
import type {
  AgentAnswer,
  AnalyticsSummary,
  AssetDetails,
  AssetRow,
  AssetTelemetry,
  BuildingHealth,
  BuildingRef,
  C3FetchResult,
  CampusHealth,
  ChatTurn,
  CorrelationResult,
  CrewRow,
  DemoState,
  FailureSimulation,
  InitStatus,
  InjectResult,
  MaintenancePlanResult,
  Prediction,
  Recommendation,
  RecomputeSummary,
  RepairSimulation,
  ReportCluster,
  ReportRow,
  RiskExplanation,
  RiskTrend,
  ScenarioRow,
  TriageResult,
  WorkOrderRow,
  ZoneRef,
} from '@/Interfaces';

export type WorkOrderFilter = 'All' | 'Open' | 'Critical' | 'PredictedFailure' | 'StudentReport' | 'Unassigned' | 'InProgress' | 'Completed';
export type ReportFilter = 'All' | 'Open' | 'Emergency' | 'Correlated' | 'Duplicates' | 'Resolved';

/**
 * Typed wrappers around the IlliniFix backend services. Every call goes through `c3Action`
 * (static methods take an argument array). There is no client-side fallback data: a failed
 * call rejects and the page shows the error.
 */
export const api = {
  // ---- IlliniFixOps (JS read façade) --------------------------------------------------------
  ensureInitialized: (): Promise<InitStatus> => c3Action('IlliniFixOps', 'ensureInitialized', []),
  getCampusHealth: (): Promise<CampusHealth> => c3Action('IlliniFixOps', 'getCampusHealth', []),
  getBuildingHealth: (buildingId: string): Promise<BuildingHealth> => c3Action('IlliniFixOps', 'getBuildingHealth', [buildingId]),
  getCriticalAssets: (): Promise<AssetRow[]> => c3Action('IlliniFixOps', 'getCriticalAssets', []),
  getAssets: (): Promise<AssetRow[]> => c3Action('IlliniFixOps', 'getAssets', []),
  getReports: (filter: ReportFilter): Promise<ReportRow[]> => c3Action('IlliniFixOps', 'getReports', [filter]),
  getAssetDetails: (assetId: string): Promise<AssetDetails> => c3Action('IlliniFixOps', 'getAssetDetails', [assetId]),
  getAssetTelemetry: (assetId: string): Promise<AssetTelemetry> => c3Action('IlliniFixOps', 'getAssetTelemetry', [assetId]),
  getFailurePrediction: (assetId: string): Promise<{ assetId: string; prediction: Prediction | null; recommendation: Recommendation | null }> =>
    c3Action('IlliniFixOps', 'getFailurePrediction', [assetId]),
  getRelatedReports: (assetId: string): Promise<ReportRow[]> => c3Action('IlliniFixOps', 'getRelatedReports', [assetId]),
  explainRisk: (assetId: string): Promise<RiskExplanation> => c3Action('IlliniFixOps', 'explainRisk', [assetId]),
  getWorkOrders: (filter: WorkOrderFilter): Promise<WorkOrderRow[]> => c3Action('IlliniFixOps', 'getWorkOrders', [filter]),
  getAvailableCrews: (): Promise<CrewRow[]> => c3Action('IlliniFixOps', 'getAvailableCrews', []),
  getRiskTrend: (): Promise<RiskTrend> => c3Action('IlliniFixOps', 'getRiskTrend', []),
  getReportClusters: (): Promise<ReportCluster[]> => c3Action('IlliniFixOps', 'getReportClusters', []),
  getAnalyticsSummary: (): Promise<AnalyticsSummary> => c3Action('IlliniFixOps', 'getAnalyticsSummary', []),
  getHighRiskWithoutWorkOrder: (): Promise<AssetRow[]> => c3Action('IlliniFixOps', 'getHighRiskWithoutWorkOrder', []),
  createDraftWorkOrder: (assetId: string): Promise<WorkOrderRow> => c3Action('IlliniFixOps', 'createDraftWorkOrder', [assetId]),
  assignCrew: (workOrderId: string, crewId: string): Promise<WorkOrderRow> => c3Action('IlliniFixOps', 'assignCrew', [workOrderId, crewId]),
  updateWorkOrderStatus: (workOrderId: string, status: string): Promise<WorkOrderRow> =>
    c3Action('IlliniFixOps', 'updateWorkOrderStatus', [workOrderId, status]),

  // ---- Entity reads used by forms ------------------------------------------------------------
  fetchBuildings: async (): Promise<BuildingRef[]> => {
    const res: C3FetchResult<BuildingRef> = await c3Action('CampusBuilding', 'fetch', { include: 'id, name, shortName', order: 'name', limit: 50 });
    return res.objs ?? [];
  },
  fetchZones: async (buildingId: string): Promise<ZoneRef[]> => {
    const res: C3FetchResult<ZoneRef> = await c3Action('CampusZone', 'fetch', {
      include: 'id, name, floor, building.id',
      filter: `building.id == '${buildingId}'`,
      order: 'floor',
      limit: 50,
    });
    return res.objs ?? [];
  },

  // ---- IlliniFixTriage (Python) --------------------------------------------------------------
  submitReport: (description: string, buildingId: string | null, zoneId: string | null, imageUrl: string | null, reporterType: string): Promise<TriageResult> =>
    c3Action('IlliniFixTriage', 'submitReport', [description, buildingId, zoneId, imageUrl, reporterType]),
  triageReport: (reportId: string): Promise<TriageResult> => c3Action('IlliniFixTriage', 'triageReport', [reportId]),
  getCorrelation: (assetId: string): Promise<CorrelationResult> => c3Action('IlliniFixTriage', 'getCorrelation', [assetId]),

  // ---- IlliniFixRiskEngine (Python) ----------------------------------------------------------
  recomputeAll: (): Promise<RecomputeSummary> => c3Action('IlliniFixRiskEngine', 'recomputeAll', []),

  // ---- IlliniFixPlanner (Python) -------------------------------------------------------------
  optimizePlan: (crewIds: string[], shiftHours: number): Promise<MaintenancePlanResult> =>
    c3Action('IlliniFixPlanner', 'optimizePlan', [crewIds, shiftHours]),
  getCurrentPlan: (): Promise<MaintenancePlanResult | null> => c3Action('IlliniFixPlanner', 'getCurrentPlan', []),
  clearPlan: (): Promise<{ cleared: boolean }> => c3Action('IlliniFixPlanner', 'clearPlan', []),

  // ---- IlliniFixSimulator (Python) -----------------------------------------------------------
  simulateAssetFailure: (assetId: string): Promise<FailureSimulation> => c3Action('IlliniFixSimulator', 'simulateAssetFailure', [assetId]),
  simulateRepair: (assetId: string): Promise<RepairSimulation> => c3Action('IlliniFixSimulator', 'simulateRepair', [assetId]),
  listScenarios: (): Promise<ScenarioRow[]> => c3Action('IlliniFixSimulator', 'listScenarios', []),

  // ---- IlliniFixAgent (Python) ---------------------------------------------------------------
  ask: (question: string, history: ChatTurn[]): Promise<AgentAnswer> =>
    c3Action('IlliniFixAgent', 'ask', [question, history.slice(-6).map((t) => ({ role: t.role, content: t.content }))]),

  // ---- IlliniFixDemo (Python) ----------------------------------------------------------------
  demo: {
    getState: (): Promise<DemoState> => c3Action('IlliniFixDemo', 'getDemoState', []),
    injectElevatorDegradation: (): Promise<InjectResult> => c3Action('IlliniFixDemo', 'injectElevatorDegradation', []),
    injectHvacFailure: (): Promise<InjectResult> => c3Action('IlliniFixDemo', 'injectHvacFailure', []),
    submitDemoReport: (): Promise<TriageResult> => c3Action('IlliniFixDemo', 'submitDemoReport', []),
    resetDemo: (): Promise<DemoState> => c3Action('IlliniFixDemo', 'resetDemo', []),
    seedTelemetry: (): Promise<{ assets: number; readingsWritten: number; telemetryEndsAt: string }> => c3Action('IlliniFixDemo', 'seedTelemetry', []),
  },
};

/** Normalises any thrown value (c3Action rejects with a string message) into readable text. */
export function errorMessage(err: unknown): string {
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  try {
    return JSON.stringify(err);
  } catch {
    return 'Unknown error';
  }
}
