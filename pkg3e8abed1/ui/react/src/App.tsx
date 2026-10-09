/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import React, { Suspense, lazy } from 'react';
import { Route, Routes } from 'react-router-dom';

import SideNav from './components/SideNav/SideNav';
import TopNav from './components/TopNav/TopNav';
import ErrorReporterProvider from './components/ErrorBoundary/ErrorBoundary';
import { IlliniFixProvider, useIlliniFix } from './contexts/IlliniFixProvider';
import TopNavActions from './components/illinifix/TopNavActions';
import AgentDrawer from './components/illinifix/AgentDrawer';
import DemoModePanel from './components/illinifix/DemoModePanel';
import { LoadingState } from './components/illinifix/States';

const OverviewPage = lazy(() => import('./pages/Overview/OverviewPage'));
const CampusMapPage = lazy(() => import('./pages/CampusMap/CampusMapPage'));
const AssetsPage = lazy(() => import('./pages/Assets/AssetsPage'));
const AssetDetailPage = lazy(() => import('./pages/Assets/AssetDetailPage'));
const ReportsPage = lazy(() => import('./pages/Reports/ReportsPage'));
const WorkOrdersPage = lazy(() => import('./pages/WorkOrders/WorkOrdersPage'));
const CrewPlannerPage = lazy(() => import('./pages/CrewPlanner/CrewPlannerPage'));
const SimulationsPage = lazy(() => import('./pages/Simulations/SimulationsPage'));
const AnalyticsPage = lazy(() => import('./pages/Analytics/AnalyticsPage'));

/** IlliniFix brand mark — an orange "I" block with a signal pulse, sized by the TopNavBar logo slot. */
const IlliniFixLogo = (
  <svg viewBox="0 0 72 72" aria-hidden="true" role="img">
    <rect x="4" y="4" width="64" height="64" rx="8" fill="var(--ifx-accent)" />
    <rect x="26" y="14" width="20" height="10" fill="#0f1f38" />
    <rect x="31" y="24" width="10" height="24" fill="#0f1f38" />
    <rect x="26" y="48" width="20" height="10" fill="#0f1f38" />
    <path d="M8 40 L18 40 L22 30 L28 50 L34 36 L38 44 L42 40 L64 40" stroke="#f3f6fb" strokeWidth="3" fill="none" strokeLinejoin="round" strokeLinecap="round" />
  </svg>
);

/**
 * Application shell. TopNav + SideNav are rendered outside <Routes> so they appear on every page;
 * the IlliniFix Operations Agent lives in a right-hand drawer and Demo Mode in a global dialog.
 */
function Shell() {
  const { agentOpen } = useIlliniFix();
  return (
    <div className="flex h-screen max-w-full flex-col overflow-hidden">
      <TopNav title="IlliniFix" logo={IlliniFixLogo} actions={<TopNavActions />} />
      <div className="flex min-h-0 flex-1">
        <SideNav />
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="flex-1 overflow-auto bg-[var(--c3-style-basic-bg-page)]">
            <Suspense fallback={<LoadingState label="Loading IlliniFix…" className="p-6" />}>
              <Routes>
                <Route path="/" element={<OverviewPage />} />
                <Route path="/map" element={<CampusMapPage />} />
                <Route path="/assets" element={<AssetsPage />} />
                <Route path="/assets/:assetId" element={<AssetDetailPage />} />
                <Route path="/reports" element={<ReportsPage />} />
                <Route path="/work-orders" element={<WorkOrdersPage />} />
                <Route path="/crews" element={<CrewPlannerPage />} />
                <Route path="/simulations" element={<SimulationsPage />} />
                <Route path="/analytics" element={<AnalyticsPage />} />
                <Route
                  path="*"
                  element={
                    <div className="flex h-full items-center justify-center p-8 text-center text-[var(--c3-style-basic-fg-neutral)]">
                      <p>Page not found.</p>
                    </div>
                  }
                />
              </Routes>
            </Suspense>
          </main>
        </div>
        {agentOpen && <AgentDrawer />}
      </div>
      <DemoModePanel />
    </div>
  );
}

export default function App() {
  return (
    <ErrorReporterProvider>
      <IlliniFixProvider>
        <Shell />
      </IlliniFixProvider>
    </ErrorReporterProvider>
  );
}
