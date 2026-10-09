/*
 * Copyright 2009-2026 C3 AI (www.c3.ai). All Rights Reserved.
 * Confidential and Proprietary C3 Materials.
 * This material, including without limitation any software, is the confidential trade secret and proprietary
 * information of C3 and its licensors. Reproduction, use and/or distribution of this material in any form is
 * strictly prohibited except as set forth in a written license agreement with C3 and/or its authorized distributors.
 * This material may be covered by one or more patents or pending patent applications.
 */

import { Activity, BarChart3, ClipboardList, Cpu, FlaskConical, LayoutDashboard, MapPinned, MessageSquareWarning, Users } from 'lucide-react';

import { NavigationItem } from '@/types/navigation';

/**
 * IlliniFix primary navigation. Each `path` must match a `<Route>` in `App.tsx`.
 * The Operations Agent is not a page — it lives in the global right-hand drawer.
 */
export const navigationConfig: NavigationItem[] = [
  { id: 'overview', path: '/', icon: LayoutDashboard, iconActive: LayoutDashboard, label: 'Overview', tooltip: 'Campus command center' },
  { id: 'map', path: '/map', icon: MapPinned, iconActive: MapPinned, label: 'Campus Map', tooltip: 'Interactive campus asset map' },
  { id: 'assets', path: '/assets', icon: Cpu, iconActive: Cpu, label: 'Assets', tooltip: 'Monitored equipment and predictions' },
  { id: 'reports', path: '/reports', icon: MessageSquareWarning, iconActive: MessageSquareWarning, label: 'Reports', tooltip: 'Human reports and AI triage' },
  { id: 'work-orders', path: '/work-orders', icon: ClipboardList, iconActive: ClipboardList, label: 'Work Orders', tooltip: 'Work order management' },
  { id: 'crews', path: '/crews', icon: Users, iconActive: Users, label: 'Crew Planner', tooltip: 'Optimize crew allocation' },
  { id: 'simulations', path: '/simulations', icon: FlaskConical, iconActive: FlaskConical, label: 'Simulations', tooltip: 'Failure and repair what-if scenarios' },
  { id: 'analytics', path: '/analytics', icon: BarChart3, iconActive: BarChart3, label: 'Analytics', tooltip: 'Maintenance impact analytics' },
];

/** Icon used for the live "pulse" indicator in the top bar. */
export const LiveIcon = Activity;

/**
 * Helper function to add navigation item dynamically
 */
export const addNavigationItem = (item: NavigationItem) => {
  navigationConfig.push(item);
};

/**
 * Helper function to remove navigation item
 */
export const removeNavigationItem = (id: string) => {
  const index = navigationConfig.findIndex((item) => item.id === id);
  if (index > -1) {
    navigationConfig.splice(index, 1);
  }
};

/**
 * Helper function to update badge count
 */
export const updateNavigationBadge = (id: string, badge?: number) => {
  const item = navigationConfig.find((item) => item.id === id);
  if (item) {
    item.badge = badge;
  }
};
