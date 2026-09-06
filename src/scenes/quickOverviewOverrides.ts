import { FieldConfigOverridesBuilder } from '@grafana/scenes';
import { ThresholdsMode } from '@grafana/schema';

// Field-level overrides for the "Cluster/ESXi VM Quick Overview" stat panels
// (cluster.json/hosts.json panel-28), ported from their fieldConfig.overrides
// - the panel-level default unit ('s') only applies to the "Uptime" field;
// every other field needs its own unit, or it renders nonsense (a raw MHz
// value formatted as a duration, e.g. "9.63 hours").
const usageThresholds = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { color: 'semi-dark-green', value: -Infinity },
    { color: 'dark-orange', value: 70 },
    { color: 'dark-red', value: 85 },
  ],
};

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
    .overrideThresholds(usageThresholds)
    .matchFieldsWithName('RAM Usage %')
    .overrideUnit('percent')
    .overrideDecimals(2)
    .overrideThresholds(usageThresholds);
}

// vm.json panel-2 ("VM Quick Overview") - same shape, no panel-level default
// unit (Uptime gets its own `unit: s` override instead), slightly different
// threshold breakpoints (70/90 instead of 70/85).
const vmUsageThresholds = {
  mode: ThresholdsMode.Absolute,
  steps: [
    { color: 'dark-green', value: -Infinity },
    { color: 'dark-orange', value: 70 },
    { color: 'dark-red', value: 90 },
  ],
};

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
    .overrideThresholds(vmUsageThresholds)
    .matchFieldsWithName('RAM Usage %')
    .overrideUnit('percent')
    .overrideThresholds(vmUsageThresholds);
}
