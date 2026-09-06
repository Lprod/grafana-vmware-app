import {
  EmbeddedScene,
  PanelBuilders,
  SceneAppPage,
  SceneAppPageLike,
  SceneControlsSpacer,
  SceneDataTransformer,
  SceneFlexItem,
  SceneFlexLayout,
  SceneQueryRunner,
  SceneRefreshPicker,
  SceneRouteMatch,
  SceneTimePicker,
  SceneTimeRange,
  SceneVariableSet,
  VariableValueControl,
} from '@grafana/scenes';
import { PLUGIN_BASE_URL, ROUTES } from '../constants';
import { clusterQueries } from '../queries/clusterQueries';
import { equals } from '../queries/queryHelpers';
import { promRunner, query } from './sceneHelpers';
import { attachExploreMenus } from './panelExplore';
import { applyVsphereDrilldownLinks } from './drilldownLinks';
import { PanelTimeRangeCompare } from './panelTimeRangeCompare';
import { applyClusterOrHostQuickOverviewOverrides } from './quickOverviewOverrides';
import { InvestigateEntityButton } from './investigateEntityButton';
import React from 'react';
import { Badge } from '@grafana/ui';
import {
  CLUSTER_VARIABLE_NAME,
  THANOS_VARIABLE_NAME,
  createClusterFilterVariable,
  createThanosDatasourceVariable,
} from '../variables/vsphereVariables';

export const CLUSTERS_URL = `${PLUGIN_BASE_URL}/${ROUTES.Clusters}`;

function getClustersListScene() {
  const queryRunner = new SceneQueryRunner({
    datasource: { uid: `\${${THANOS_VARIABLE_NAME}}` },
    queries: [
      { refId: 'info', expr: `count by (vcenter, clustername) (vsphere_host_sys_uptime_latest{clustername=~"$clustername"})`, format: 'table', instant: true },
      { refId: 'uptime', expr: clusterQueries.uptime({ clustername: '=~"$clustername"' }), format: 'table', instant: true },
      { refId: 'cpu', expr: clusterQueries.cpuUsagePercent({ clustername: '=~"$clustername"' }), format: 'table', instant: true },
      { refId: 'mem', expr: clusterQueries.ramUsagePercent({ clustername: '=~"$clustername"' }), format: 'table', instant: true },
    ],
  });

  const transformedData = new SceneDataTransformer({
    $data: queryRunner,
    transformations: [
      { id: 'joinByField', options: { byField: 'clustername', mode: 'outer' } },
      {
        id: 'organize',
        options: {
          excludeByName: { Time: true },
          indexByName: { clustername: 0, vcenter: 1, 'Value #info': 2, 'Value #uptime': 3, 'Value #cpu': 4, 'Value #mem': 5 },
        },
      },
    ],
  });

  const table = PanelBuilders.table()
    .setTitle('Clusters')
    .setData(transformedData)
    .setOverrides((b) =>
      applyVsphereDrilldownLinks(b)
        .matchFieldsWithName('Value #info')
        .overrideDisplayName('Hosts')
        .overrideUnit('none')
        .matchFieldsWithName('Value #uptime')
        .overrideDisplayName('Uptime')
        .overrideUnit('s')
        .matchFieldsWithName('Value #cpu')
        .overrideDisplayName('CPU %')
        .overrideUnit('percent')
        .matchFieldsWithName('Value #mem')
        .overrideDisplayName('RAM %')
        .overrideUnit('percent')
    )
    .build();

  return new EmbeddedScene({
    $behaviors: [attachExploreMenus],
    body: new SceneFlexLayout({ direction: 'column', children: [new SceneFlexItem({ body: table })] }),
  });
}

// Detail page ported 1:1 from /opt/vmware/cluster.json - same panel titles,
// PromQL and units, scoped down to this one cluster (the source dashboard
// scopes by both `$vcenter` and `$cluster`; this page is reached via just a
// cluster-name route param, so it's scoped by `clustername` alone).
//
// Two intentional deviations from the source JSON, both fixing what look
// like authoring bugs rather than app-specific redesigns:
// - panel-28's "RAM Usage" query hardcoded a literal
//   vcenter="vmware-entw-web.services.debeka.de"/clustername="HRVPEN01"
//   instead of using the same $vcenter/$cluster scoping as its four sibling
//   queries in the same panel - fixed to match.
function getClusterDetailScene(cluster: string) {
  const f = { clustername: equals(cluster) };
  const q = clusterQueries;

  const quickOverview = promRunner(
    [
      query('A', q.uptime(f), 'Uptime'),
      query('B', q.cpuUsageMhz(f), 'CPU Usage MHz'),
      query('C', q.ramUsageBytes(f), 'RAM Usage'),
      query('D', q.cpuUsagePercent(f), 'CPU Usage %'),
      query('E', q.ramUsagePercent(f), 'RAM Usage %'),
    ],
    { instant: true }
  );

  const storageIops = promRunner([
    query('A', q.storageAdapterReadIops(f), '{{adapter}} Read'),
    query('B', `${q.storageAdapterWriteIops(f)} * -1`, '{{adapter}} Write'),
  ]);
  const cpuReadyByHost = promRunner([query('A', q.cpuReadyPercentByHost(f), '{{esxhostname}} CPU_READY')]);
  const network = promRunner([
    query('A', q.networkBytesRxByInterface(f), '{{interface}} bytesRx'),
    query('B', q.networkBytesTxByInterface(f), '{{interface}} bytesTx'),
  ]);
  const hostUptimeTable = new SceneDataTransformer({
    $data: promRunner([query('A', q.hostUptimeTable(f))], { instant: true, format: 'table' }),
    transformations: [{ id: 'organize', options: { excludeByName: { Time: true, Value: true } } }],
  });
  const cpuWorkload = promRunner([query('A', q.cpuWorkloadVsOneDatacenter(f), 'CPU Workload')]);
  const capacityVsOne = promRunner([
    query('A', q.cpuFailoverCapacity(f), 'CPU Failover Capacity'),
    query('B', q.cpuUsageMhz(f), 'CPU Usage'),
  ]);
  const capacityVsBoth = promRunner([
    query('A', q.cpuTotalCapacityBothDatacenters(f), 'CPU Total Capacity beide RZs'),
    query('B', q.cpuUsageMhz(f), 'CPU Usage'),
  ]);

  const ts = (title: string, unit: string, data: ReturnType<typeof promRunner>) =>
    PanelBuilders.timeseries().setTitle(title).setUnit(unit).setData(data).setHeaderActions(new PanelTimeRangeCompare()).build();

  return new EmbeddedScene({
    $behaviors: [attachExploreMenus],
    body: new SceneFlexLayout({
      direction: 'column',
      children: [
        new SceneFlexLayout({
          direction: 'row',
          height: 260,
          children: [
            new SceneFlexItem({
              width: '25%',
              body: PanelBuilders.stat()
                .setTitle('Cluster Quick Overview')
                .setUnit('s')
                .setData(quickOverview)
                .setOverrides(applyClusterOrHostQuickOverviewOverrides)
                .build(),
            }),
            new SceneFlexItem({ width: '75%', body: ts('Storage Adapter IOPS', 'short', storageIops) }),
          ],
        }),
        new SceneFlexLayout({
          direction: 'row',
          height: 260,
          children: [
            new SceneFlexItem({ width: '25%', body: ts('CPU Ready in percent per host', 'none', cpuReadyByHost) }),
            new SceneFlexItem({ width: '75%', body: ts('Network Usage', 'KBs', network) }),
          ],
        }),
        new SceneFlexLayout({
          direction: 'row',
          height: 260,
          children: [
            new SceneFlexItem({
              width: '25%',
              body: PanelBuilders.table().setTitle('').setUnit('s').setData(hostUptimeTable).setOverrides(applyVsphereDrilldownLinks).build(),
            }),
            new SceneFlexItem({ width: '75%', body: ts('CPU Auslastung im Vergleich zu einem RZ (CPU Workload)', 'percent', cpuWorkload) }),
          ],
        }),
        new SceneFlexItem({ height: 260, body: ts('Kapazitätsnutzung im Vergleich zu einem RZ', 'MHz', capacityVsOne) }),
        new SceneFlexItem({ height: 260, body: ts('Kapazitätsnutzung im Vergleich zu beiden RZs', 'MHz', capacityVsBoth) }),
      ],
    }),
  });
}

function ClusterPageTitle({ title }: { title: string }) {
  return (
    <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
      {title}
      <Badge text="cluster" color="blue" />
      <InvestigateEntityButton kind="cluster" name={title} cluster={title} />
    </h1>
  );
}

function getClusterDetailPage(routeMatch: SceneRouteMatch<{ cluster: string }>, parent: SceneAppPageLike) {
  const cluster = decodeURIComponent(routeMatch.params.cluster);

  return new SceneAppPage({
    title: cluster,
    renderTitle: (title) => <ClusterPageTitle title={title} />,
    url: `${CLUSTERS_URL}/${encodeURIComponent(cluster)}`,
    routePath: `${CLUSTERS_URL}/${encodeURIComponent(cluster)}`,
    getParentPage: () => parent,
    getScene: () => getClusterDetailScene(cluster),
    $timeRange: new SceneTimeRange({ from: 'now-1h', to: 'now' }),
    $variables: new SceneVariableSet({ variables: [createThanosDatasourceVariable()] }),
    controls: [
      new VariableValueControl({ variableName: THANOS_VARIABLE_NAME }),
      new SceneControlsSpacer(),
      new SceneTimePicker({}),
      new SceneRefreshPicker({ refresh: '1m' }),
    ],
    preserveUrlKeys: ['from', 'to', 'timezone', 'refresh', `var-${THANOS_VARIABLE_NAME}`],
  });
}

export function getClustersPage() {
  return new SceneAppPage({
    title: 'Clusters',
    url: CLUSTERS_URL,
    routePath: `${ROUTES.Clusters}/*`,
    getScene: getClustersListScene,
    $timeRange: new SceneTimeRange({ from: 'now-1h', to: 'now' }),
    $variables: new SceneVariableSet({
      variables: [createThanosDatasourceVariable(), createClusterFilterVariable()],
    }),
    controls: [
      new VariableValueControl({ variableName: THANOS_VARIABLE_NAME }),
      new VariableValueControl({ variableName: CLUSTER_VARIABLE_NAME }),
      new SceneControlsSpacer(),
      new SceneTimePicker({}),
      new SceneRefreshPicker({ refresh: '1m' }),
    ],
    preserveUrlKeys: ['from', 'to', 'timezone', 'refresh', `var-${THANOS_VARIABLE_NAME}`, `var-${CLUSTER_VARIABLE_NAME}`],
    drilldowns: [{ routePath: '/:cluster/*', getPage: getClusterDetailPage }],
  });
}
