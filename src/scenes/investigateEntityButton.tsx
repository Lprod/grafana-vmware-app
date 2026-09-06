import React from 'react';
import { createAssistantContextItem, OpenAssistantButton } from '@grafana/assistant';

// "Investigate" for a whole Drilldown page, rendered next to the page
// title's own entity badge - same pattern as debeka-k8s-app's
// InvestigateEntityButton, scoped to vSphere entities instead of Kubernetes
// ones. Kept as a plain React component (no scene object): every page title
// here is already a plain component passed to `SceneAppPage.renderTitle`.

export type InvestigateEntityKind = 'vcenter' | 'cluster' | 'host' | 'vm';

export type InvestigateEntityProps = {
  kind: InvestigateEntityKind;
  /** The entity's own name - the vCenter/cluster/host/VM. */
  name: string;
  vcenter?: string;
  cluster?: string;
  host?: string;
};

function describeScope({ kind, name, vcenter, cluster, host }: InvestigateEntityProps) {
  const noun = kind === 'host' ? 'ESXi host' : kind === 'vm' ? 'virtual machine' : kind;
  const parts = [`the VMware ${noun} "${name}"`];
  if (host && kind !== 'host') {
    parts.push(`on host "${host}"`);
  }
  if (cluster && kind !== 'cluster') {
    parts.push(`in cluster "${cluster}"`);
  }
  if (vcenter && kind !== 'vcenter') {
    parts.push(`on vCenter "${vcenter}"`);
  }
  return parts.join(' ');
}

export function InvestigateEntityButton(props: InvestigateEntityProps) {
  const { kind, name, vcenter, cluster, host } = props;
  const scope = describeScope(props);
  const prompt =
    `Assess the current health of ${scope}. Look at its CPU/RAM/network/storage usage and readiness, ` +
    `any abnormal latency or IOPS, and its uptime. Summarise what looks wrong (or confirm it looks ` +
    `healthy) and suggest concrete next steps.`;

  return (
    <OpenAssistantButton
      title="Investigate"
      size="sm"
      origin={`debeka-vmware-app/${kind}-drilldown`}
      prompt={prompt}
      context={[
        createAssistantContextItem('structured', {
          title: `${kind}: ${name}`,
          data: { kind, name, vcenter, cluster, host },
        }),
      ]}
    />
  );
}
