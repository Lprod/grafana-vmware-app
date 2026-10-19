import { FieldConfigOverridesBuilder } from '@grafana/scenes';
import { usageGrafanaThresholds } from './designSystem';

// Field-level overrides for the "Cluster/ESXi VM Quick Overview" stat panels
// (cluster.json/hosts.json panel-28), ported from their fieldConfig.overrides
// - the panel-level default unit ('s') only applies to the "Uptime" field;
// every other field needs its own unit, or it renders nonsense (a raw MHz
// value formatted as a duration, e.g. "9.63 hours"). Thresholds now come
// from the shared `usageGrafanaThresholds` (see designSystem.ts) instead of
// a locally-redeclared 70/85 scale, so these tiles match every other
// CPU/RAM percentage in the app (list-table meter cells, health banners).
export function applyClusterOrHostQuickOverviewOverrides(b: FieldConfigOverridesBuilder<any>) {
  return b
    .matchFieldsWithName('CPU Usage MHz')
    .overrideUnit('none')
    .overrideDecimals(0)
    .matchFieldsWithName('RAM Usage')
    .overrideUnit('deckbytes')
    .overrideDecimals(2)
    .matchFieldsWithName('CPU Usage %')
    .overrideUnit('percent')
    .overrideDecimals(2)
    .overrideThresholds(usageGrafanaThresholds)
    .matchFieldsWithName('RAM Usage %')
    .overrideUnit('percent')
    .overrideDecimals(2)
    .overrideThresholds(usageGrafanaThresholds);
}

// vm.json panel-2 ("VM Quick Overview") - same shape, no panel-level default
// unit (Uptime gets its own `unit: s` override instead). Previously had its
// own slightly different threshold breakpoints (70/90 instead of 70/85) -
// unified onto the shared scale so a VM's "85%" reads the same as a
// cluster's or host's.
export function applyVmQuickOverviewOverrides(b: FieldConfigOverridesBuilder<any>) {
  return b
    .matchFieldsWithName('Uptime')
    .overrideUnit('s')
    .matchFieldsWithName('CPU Usage MHz')
    .overrideUnit('none')
    .overrideDecimals(0)
    .matchFieldsWithName('RAM Usage')
    .overrideUnit('deckbytes')
    .matchFieldsWithName('CPU Usage %')
    .overrideUnit('percent')
    .overrideThresholds(usageGrafanaThresholds)
    .matchFieldsWithName('RAM Usage %')
    .overrideUnit('percent')
    .overrideThresholds(usageGrafanaThresholds);
}
