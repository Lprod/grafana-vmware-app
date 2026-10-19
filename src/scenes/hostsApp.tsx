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
import { hostQueries } from '../queries/hostQueries';
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
  HOST_VARIABLE_NAME,
  THANOS_VARIABLE_NAME,
  createHostFilterVariable,
  createThanosDatasourceVariable,
} from '../variables/vsphereVariables';

export const HOSTS_URL = `${PLUGIN_BASE_URL}/${ROUTES.Hosts}`;

const usagePercentOverride = customCellOptions(UsagePercentCell);

function getHostsListScene() {
  const esxFilter = { esxhostname: '=~"$esxhostname"' };

  const queryRunner = new SceneQueryRunner({
    datasource: { uid: `\${${THANOS_VARIABLE_NAME}}` },
    queries: [
      {
        refId: 'info',
        expr: `group by (vcenter, clustername, esxhostname) (vsphere_host_sys_uptime_latest{esxhostname=~"$esxhostname"})`,
        format: 'table',
        instant: true,
      },
      { refId: 'uptime', expr: hostQueries.uptime(esxFilter), format: 'table', instant: true },
      { refId: 'cpu', expr: hostQueries.cpuUsagePercent(esxFilter), format: 'table', instant: true },
      { refId: 'mem', expr: hostQueries.ramUsagePercent(esxFilter), format: 'table', instant: true },
    ],
  });

  const transformedData = new SceneDataTransformer({
    $data: queryRunner,
    transformations: [
      { id: 'joinByField', options: { byField: 'esxhostname', mode: 'outer' } },
      {
        id: 'organize',
        options: {
          excludeByName: { Time: true, 'Value #info': true },
          indexByName: {
            esxhostname: 0,
            clustername: 1,
            vcenter: 2,
            'Value #uptime': 3,
            'Value #cpu': 4,
            'Value #mem': 5,
          },
        },
      },
    ],
  });

  const table = PanelBuilders.table()
    .setTitle('ESXi hosts')
    .setData(transformedData)
    .setOverrides((b) =>
      applyVsphereDrilldownLinks(b)
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

// Overview tab: Quick Overview stat tile -> Virtual Machines table.
function getHostOverviewScene(host: string) {
  const f = { esxhostname: equals(host) };
  const q = hostQueries;

  const quickOverview = promRunner(
    [
      query('A', q.uptime(f), 'Uptime'),
      query('B', q.cpuUsageMhz(f), 'CPU Usage MHz'),
      query('D', q.ramUsageBytes(f), 'RAM Usage'),
      query('C', q.cpuUsagePercent(f), 'CPU Usage %'),
      query('E', q.ramUsagePercent(f), 'RAM Usage %'),
    ],
    { instant: true }
  );

  const vmTable = new SceneDataTransformer({
    $data: new SceneQueryRunner({
      datasource: { uid: `\${${THANOS_VARIABLE_NAME}}` },
      queries: [
        { refId: 'mem', expr: q.vmMemUsageTable(f), format: 'table', instant: true },
        { refId: 'cpu', expr: q.vmCpuUsageTable(f), format: 'table', instant: true },
      ],
    }),
    transformations: [
      { id: 'joinByField', options: { byField: 'vmname', mode: 'outer' } },
      { id: 'organize', options: { excludeByName: { Time: true, esxhostname: true } } },
    ],
  });

  return new EmbeddedScene({
    $behaviors: [attachExploreMenus],
    body: new SceneFlexLayout({
      direction: 'column',
      children: [
        new SceneFlexItem({
          height: 200,
          body: PanelBuilders.stat()
            .setTitle('ESXi Host Quick Overview')
            .setUnit('s')
            .setData(quickOverview)
            .setOverrides(applyClusterOrHostQuickOverviewOverrides)
            .build(),
        }),
        new SceneFlexItem({
          height: 300,
          body: PanelBuilders.table()
            .setTitle('Virtual Machines')
            .setData(vmTable)
            .setOverrides((b) =>
              applyVsphereDrilldownLinks(b)
                .matchFieldsWithName('Value #mem')
                .overrideDisplayName('RAM %')
                .overrideUnit('percent')
                .overrideCustomFieldConfig('cellOptions', usagePercentOverride)
                .matchFieldsWithName('Value #cpu')
                .overrideDisplayName('CPU %')
                .overrideUnit('percent')
                .overrideCustomFieldConfig('cellOptions', usagePercentOverride)
            )
            .build(),
        }),
      ],
    }),
  });
}

// Performance tab: the host's detailed CPU/RAM/network/storage charts.
function getHostPerformanceScene(host: string) {
  const f = { esxhostname: equals(host) };
  const q = hostQueries;

  const cpuByCpu = promRunner([query('A', q.cpuUtilizationAvgPercentByCpu(f), 'CPU Usage % {{cpu}}')]);
  const ramUtilization = promRunner([query('A', q.ramUtilizationPercent(f), 'RAM Usage %')]);
  const cpuReady = promRunner([query('A', q.cpuReadyMs(f), 'CPU Ready')]);
  const network = promRunner([
    query('A', q.networkBytesRxByInterface(f), '{{interface}} bytesRx'),
    query('B', q.networkBytesTxByInterface(f), '{{interface}} bytesTx'),
  ]);
  const diskLatency = promRunner([
    query('A', q.diskReadLatencyByDisk(f), 'Read - {{disk}}'),
    query('B', q.diskWriteLatencyByDisk(f), 'Write - {{disk}}'),
  ]);
  const storageIops = promRunner([
    query('A', q.storageAdapterReadIops(f), '{{adapter}} Read'),
    query('B', q.storageAdapterWriteIops(f), '{{adapter}} Write'),
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
            new SceneFlexItem({ body: ts('CPU Utilization Avg %', 'percent', cpuByCpu) }),
            new SceneFlexItem({ body: ts('RAM Utilization', 'percent', ramUtilization) }),
            new SceneFlexItem({ body: ts('CPU Ready in miliseconds', 'none', cpuReady) }),
          ],
        }),
        new SceneFlexLayout({
          direction: 'row',
          height: 260,
          children: [
            new SceneFlexItem({ body: ts('Total Disk Latency', 'none', diskLatency) }),
            new SceneFlexItem({ body: ts('Storage Adapter IOPS', 'short', storageIops) }),
          ],
        }),
        new SceneFlexItem({ height: 260, body: ts('Network Usage', 'KBs', network) }),
      ],
    }),
  });
}

function getHostDetailPage(routeMatch: SceneRouteMatch<{ host: string }>, parent: SceneAppPageLike) {
  const host = decodeURIComponent(routeMatch.params.host);
  const baseUrl = `${HOSTS_URL}/${encodeURIComponent(host)}`;

  const tabs = [
    { slug: 'overview', title: 'Overview', getScene: () => getHostOverviewScene(host) },
    { slug: 'performance', title: 'Performance', getScene: () => getHostPerformanceScene(host) },
  ].map(
    (tab) =>
      new SceneAppPage({ title: tab.title, url: `${baseUrl}/${tab.slug}`, routePath: tab.slug, getScene: tab.getScene })
  );

  return new SceneAppPage({
    title: host,
    renderTitle: (title) => <EntityPageTitle title={title} investigate={{ kind: 'host', name: title, host: title }} />,
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

export function getHostsPage() {
  return new SceneAppPage({
    title: 'Hosts',
    url: HOSTS_URL,
    routePath: `${ROUTES.Hosts}/*`,
    getScene: getHostsListScene,
    $timeRange: new SceneTimeRange({ from: 'now-1h', to: 'now' }),
    $variables: new SceneVariableSet({
      variables: [createThanosDatasourceVariable(), createHostFilterVariable()],
    }),
    controls: [
      new VariableValueControl({ variableName: THANOS_VARIABLE_NAME }),
      new VariableValueControl({ variableName: HOST_VARIABLE_NAME }),
      new SceneControlsSpacer(),
      new SceneTimePicker({}),
      new SceneRefreshPicker({ refresh: '1m' }),
    ],
    preserveUrlKeys: ['from', 'to', 'timezone', 'refresh', `var-${THANOS_VARIABLE_NAME}`, `var-${HOST_VARIABLE_NAME}`],
    drilldowns: [{ routePath: '/:host/*', getPage: getHostDetailPage }],
  });
}
