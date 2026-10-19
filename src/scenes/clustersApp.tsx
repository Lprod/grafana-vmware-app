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
import { EntityPageTitle } from './entityBadge';
import { customCellOptions, UsagePercentCell } from './tableCells';
import React from 'react';
import {
  CLUSTER_VARIABLE_NAME,
  THANOS_VARIABLE_NAME,
  createClusterFilterVariable,
  createThanosDatasourceVariable,
} from '../variables/vsphereVariables';

export const CLUSTERS_URL = `${PLUGIN_BASE_URL}/${ROUTES.Clusters}`;

const usagePercentOverride = customCellOptions(UsagePercentCell);

function getClustersListScene() {
  const queryRunner = new SceneQueryRunner({
    datasource: { uid: `\${${THANOS_VARIABLE_NAME}}` },
    queries: [
      {
        refId: 'info',
        expr: `count by (vcenter, clustername) (vsphere_host_sys_uptime_latest{clustername=~"$clustername"})`,
        format: 'table',
        instant: true,
      },
      {
        refId: 'uptime',
        expr: clusterQueries.uptime({ clustername: '=~"$clustername"' }),
        format: 'table',
        instant: true,
      },
      {
        refId: 'cpu',
        expr: clusterQueries.cpuUsagePercent({ clustername: '=~"$clustername"' }),
        format: 'table',
        instant: true,
      },
      {
        refId: 'mem',
        expr: clusterQueries.ramUsagePercent({ clustername: '=~"$clustername"' }),
        format: 'table',
        instant: true,
      },
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
          indexByName: {
            clustername: 0,
            vcenter: 1,
            'Value #info': 2,
            'Value #uptime': 3,
            'Value #cpu': 4,
            'Value #mem': 5,
          },
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
        .overrideCustomFieldConfig('cellOptions', usagePercentOverride)
        .matchFieldsWithName('Value #mem')
        .overrideDisplayName('RAM %')
        .overrideUnit('percent')
        .overrideCustomFieldConfig('cellOptions', usagePercentOverride)
    )
    .build();

  return new EmbeddedScene({
    $behaviors: [attachExploreMenus],
    body: new SceneFlexLayout({ direction: 'column', children: [new SceneFlexItem({ body: table })] }),
  });
}

// Overview tab: Quick Overview stat tile -> Hosts table.
function getClusterOverviewScene(cluster: string) {
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

  const hostUptimeTable = new SceneDataTransformer({
    $data: promRunner([query('A', q.hostUptimeTable(f))], { instant: true, format: 'table' }),
    transformations: [{ id: 'organize', options: { excludeByName: { Time: true, Value: true } } }],
  });

  return new EmbeddedScene({
    $behaviors: [attachExploreMenus],
    body: new SceneFlexLayout({
      direction: 'column',
      children: [
        new SceneFlexItem({
          height: 200,
          body: PanelBuilders.stat()
            .setTitle('Cluster Quick Overview')
            .setUnit('s')
            .setData(quickOverview)
            .setOverrides(applyClusterOrHostQuickOverviewOverrides)
            .build(),
        }),
        new SceneFlexItem({
          height: 300,
          body: PanelBuilders.table()
            .setTitle('Hosts')
            .setUnit('s')
            .setData(hostUptimeTable)
            .setOverrides(applyVsphereDrilldownLinks)
            .build(),
        }),
      ],
    }),
  });
}

// Performance tab: the cluster's detailed capacity/IOPS/network charts.
function getClusterPerformanceScene(cluster: string) {
  const f = { clustername: equals(cluster) };
  const q = clusterQueries;

  const storageIops = promRunner([
    query('A', q.storageAdapterReadIops(f), '{{adapter}} Read'),
    query('B', `${q.storageAdapterWriteIops(f)} * -1`, '{{adapter}} Write'),
  ]);
  const cpuReadyByHost = promRunner([query('A', q.cpuReadyPercentByHost(f), '{{esxhostname}} CPU_READY')]);
  const network = promRunner([
    query('A', q.networkBytesRxByInterface(f), '{{interface}} bytesRx'),
    query('B', q.networkBytesTxByInterface(f), '{{interface}} bytesTx'),
  ]);
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
    PanelBuilders.timeseries()
      .setTitle(title)
      .setUnit(unit)
      .setData(data)
      .setHeaderActions(new PanelTimeRangeCompare())
      .build();

  return new EmbeddedScene({
    $behaviors: [attachExploreMenus],
    body: new SceneFlexLayout({
      direction: 'column',
      children: [
        new SceneFlexLayout({
          direction: 'row',
          height: 260,
          children: [
            new SceneFlexItem({ body: ts('Storage Adapter IOPS', 'short', storageIops) }),
            new SceneFlexItem({ body: ts('CPU Ready in percent per host', 'none', cpuReadyByHost) }),
          ],
        }),
        new SceneFlexItem({ height: 260, body: ts('Network Usage', 'KBs', network) }),
        new SceneFlexItem({
          height: 260,
          body: ts('CPU Auslastung im Vergleich zu einem RZ (CPU Workload)', 'percent', cpuWorkload),
        }),
        new SceneFlexItem({
          height: 260,
          body: ts('Kapazitätsnutzung im Vergleich zu einem RZ', 'MHz', capacityVsOne),
        }),
        new SceneFlexItem({
          height: 260,
          body: ts('Kapazitätsnutzung im Vergleich zu beiden RZs', 'MHz', capacityVsBoth),
        }),
      ],
    }),
  });
}

function getClusterDetailPage(routeMatch: SceneRouteMatch<{ cluster: string }>, parent: SceneAppPageLike) {
  const cluster = decodeURIComponent(routeMatch.params.cluster);
  const baseUrl = `${CLUSTERS_URL}/${encodeURIComponent(cluster)}`;

  const tabs = [
    { slug: 'overview', title: 'Overview', getScene: () => getClusterOverviewScene(cluster) },
    { slug: 'performance', title: 'Performance', getScene: () => getClusterPerformanceScene(cluster) },
  ].map(
    (tab) =>
      new SceneAppPage({ title: tab.title, url: `${baseUrl}/${tab.slug}`, routePath: tab.slug, getScene: tab.getScene })
  );

  return new SceneAppPage({
    title: cluster,
    renderTitle: (title) => (
      <EntityPageTitle title={title} investigate={{ kind: 'cluster', name: title, cluster: title }} />
    ),
    url: baseUrl,
    routePath: baseUrl,
    getParentPage: () => parent,
    tabs,
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
    preserveUrlKeys: [
      'from',
      'to',
      'timezone',
      'refresh',
      `var-${THANOS_VARIABLE_NAME}`,
      `var-${CLUSTER_VARIABLE_NAME}`,
    ],
    drilldowns: [{ routePath: '/:cluster/*', getPage: getClusterDetailPage }],
  });
}
