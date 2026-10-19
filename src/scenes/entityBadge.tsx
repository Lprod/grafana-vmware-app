import React from 'react';
import { Badge } from '@grafana/ui';
import { ENTITY_BADGE_COLOR } from './designSystem';
import { InvestigateEntityButton, InvestigateEntityProps } from './investigateEntityButton';

export function EntityBadge({ kind }: { kind: InvestigateEntityProps['kind'] }) {
  return <Badge text={kind} color={ENTITY_BADGE_COLOR[kind]} />;
}

// Shared drilldown page title: entity name + its kind badge + an Investigate
// (Assistant) button - deduplicated out of what used to be three near-
// identical ClusterPageTitle/HostPageTitle/VmPageTitle components, which
// only differed in which InvestigateEntityButton props they passed and
// always hardcoded the badge to blue regardless of entity kind.
export function EntityPageTitle({ title, investigate }: { title: string; investigate: InvestigateEntityProps }) {
  return (
    <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
      {title}
      <EntityBadge kind={investigate.kind} />
      <InvestigateEntityButton {...investigate} />
    </h1>
  );
}
