import { ThresholdsMode } from '@grafana/schema';
import { BadgeColor } from '@grafana/ui';
import { InvestigateEntityKind } from './investigateEntityButton';

// Single usage-vs-capacity threshold scale, shared by every CPU/RAM/CPU
// Ready percentage in the app (list-table meter cells, Quick Overview stat
// panels, health banners). Previously duplicated three times with slightly
// different breakpoints (cluster/host: 70/85, VM: 70/90) - unified here so a
// "70%" or "85%" reading means the same thing everywhere, mirroring
// debeka-k8s-app's own single, centrally-defined `usageThresholds`.
export const USAGE_MED_THRESHOLD = 70;
export const USAGE_HIGH_THRESHOLD = 85;

export const usageGrafanaThresholds = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { color: 'semi-dark-green', value: -Infinity },
    { color: 'dark-orange', value: USAGE_MED_THRESHOLD },
    { color: 'dark-red', value: USAGE_HIGH_THRESHOLD },
  ],
};

export type UsageTier = 'low' | 'med' | 'high' | 'unknown';

export function usageTierFromPercent(percent: number | null | undefined): UsageTier {
  if (percent === null || percent === undefined || Number.isNaN(percent)) {
    return 'unknown';
  }
  if (percent >= USAGE_HIGH_THRESHOLD) {
    return 'high';
  }
  if (percent >= USAGE_MED_THRESHOLD) {
    return 'med';
  }
  return 'low';
}

// Entity badge colors - one fixed, unclaimed hue per vSphere object kind,
// used consistently next to every drilldown page title and in the Search
// page's category tags. Deliberately reuses debeka-k8s-app's own badge
// palette for the concept the two apps share (cluster=blue, the literal same
// color in both apps) and extends it for vSphere's vcenter/host/vm kinds.
export const ENTITY_BADGE_COLOR: Record<InvestigateEntityKind, BadgeColor> = {
  vcenter: 'purple',
  cluster: 'blue',
  host: 'darkgrey',
  vm: 'orange',
};
