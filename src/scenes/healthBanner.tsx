import React from 'react';
import { css } from '@emotion/css';
import { GrafanaTheme2, IconName } from '@grafana/data';
import { SceneComponentProps, SceneDataProvider, SceneObjectBase, SceneObjectState, sceneGraph } from '@grafana/scenes';
import { Icon, useStyles2 } from '@grafana/ui';
import { findValueByRefId } from './infoCard';
import { USAGE_HIGH_THRESHOLD, USAGE_MED_THRESHOLD } from './designSystem';

type Severity = 'success' | 'warning' | 'error';

export interface UsageHealthBannerState extends SceneObjectState {
  /** e.g. "Cluster", "ESXi host", "Virtual machine". */
  subject: string;
  $data: SceneDataProvider;
  /** refId of the CPU usage % query within `$data`. */
  cpuRefId: string;
  /** refId of the RAM usage % query within `$data`. */
  ramRefId: string;
  /** refId of the CPU Ready % query, when this entity has one - elevated readiness means CPU contention. */
  readyRefId?: string;
}

const SEVERITY_ICON: Record<Severity, IconName> = {
  success: 'check-circle',
  warning: 'exclamation-triangle',
  error: 'times-circle',
};
const SEVERITY_LABEL: Record<Severity, string> = { success: 'healthy', warning: 'degraded', error: 'critical' };

// The CPU Ready % floor above which contention (not just raw usage) is
// flagged as a warning - picked independently of the usage-vs-capacity
// thresholds since "5% ready" is a commonly-cited vSphere rule of thumb for
// noticeable scheduling delay, not a usage percentage.
const READY_WARNING_THRESHOLD = 5;

// Derives a severity banner purely from the CPU/RAM/CPU-Ready numbers this
// app already queries for its "Quick Overview" stat tile. vSphere's Telegraf
// metrics here carry no connection-state or alarm data (unlike
// debeka-k8s-app's node-condition/alert-derived banners), so "healthy" is
// honestly defined as "usage and contention are within this app's own
// thresholds" rather than a fabricated status.
function computeSeverity(
  cpu: number | null,
  ram: number | null,
  ready: number | null
): { severity: Severity; message: string } {
  const worst = Math.max(cpu ?? -Infinity, ram ?? -Infinity);
  const worstMetric = (cpu ?? -Infinity) >= (ram ?? -Infinity) ? 'CPU' : 'RAM';

  if (worst >= USAGE_HIGH_THRESHOLD) {
    return { severity: 'error', message: `${worstMetric} usage is critically high (${worst.toFixed(0)}%).` };
  }
  if (worst >= USAGE_MED_THRESHOLD) {
    return { severity: 'warning', message: `${worstMetric} usage is elevated (${worst.toFixed(0)}%).` };
  }
  if (ready !== null && ready >= READY_WARNING_THRESHOLD) {
    return { severity: 'warning', message: `CPU Ready is elevated (${ready.toFixed(1)}%), indicating CPU contention.` };
  }
  return { severity: 'success', message: 'Usage and CPU Ready are within normal limits.' };
}

export class UsageHealthBanner extends SceneObjectBase<UsageHealthBannerState> {
  static Component = UsageHealthBannerRenderer;
}

function UsageHealthBannerRenderer({ model }: SceneComponentProps<UsageHealthBanner>) {
  const styles = useStyles2(getStyles);
  const { subject, cpuRefId, ramRefId, readyRefId } = model.useState();
  const { data } = sceneGraph.getData(model).useState();
  const frames = data?.series ?? [];

  const cpuRaw = findValueByRefId(frames, cpuRefId);
  const ramRaw = findValueByRefId(frames, ramRefId);
  const readyRaw = readyRefId ? findValueByRefId(frames, readyRefId) : undefined;

  if (cpuRaw === undefined && ramRaw === undefined) {
    return null;
  }

  const cpu = cpuRaw !== undefined ? parseFloat(cpuRaw) : null;
  const ram = ramRaw !== undefined ? parseFloat(ramRaw) : null;
  const ready = readyRaw !== undefined ? parseFloat(readyRaw) : null;
  const { severity, message } = computeSeverity(cpu, ram, ready);

  return (
    <div className={styles[severity]}>
      <Icon name={SEVERITY_ICON[severity]} size="lg" />
      <span className={styles.message}>
        {subject} is {SEVERITY_LABEL[severity]}. {message}
      </span>
    </div>
  );
}

function getStyles(theme: GrafanaTheme2) {
  const forSeverity = (s: Severity) =>
    css({
      display: 'flex',
      alignItems: 'center',
      gap: theme.spacing(1),
      padding: theme.spacing(1, 2),
      borderRadius: theme.shape.radius.default,
      background: theme.colors[s].transparent,
      border: `1px solid ${theme.colors[s].border}`,
      color: theme.colors[s].text,
    });
  return {
    success: forSeverity('success'),
    warning: forSeverity('warning'),
    error: forSeverity('error'),
    message: css({ flexGrow: 1 }),
  };
}
