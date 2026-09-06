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
import { InvestigateEntityButton } from './investigateEntityButton';
import React from 'react';
import { Badge } from '@grafana/ui';
import {
  HOST_VARIABLE_NAME,
  THANOS_VARIABLE_NAME,
  createHostFilterVariable,
  createThanosDatasourceVariable,
} from '../variables/vsphereVariables';

export const HOSTS_URL = `${PLUGIN_BASE_URL}/${ROUTES.Hosts}`;

function getHostsListScene() {
  const esxFilter = { esxhostname: '=~"$esxhostname"' };

  const queryRunner = new SceneQueryRunner({
    datasource: { uid: `\${${THANOS_VARIABLE_NAME}}` },
    queries: [
      { refId: 'info', expr: `group by (vcenter, clustername, esxhostname) (vsphere_host_sys_uptime_latest{esxhostname=~"$esxhostname"})`, format: 'table', instant: true },
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
          excludeByName: { Time: true, Value: true },
          indexByName: { esxhostname: 0, clustername: 1, vcenter: 2, 'Value #uptime': 3, 'Value #cpu': 4, 'Value #mem': 5 },
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

// Detail page ported 1:1 from /opt/vmware/hosts.json - same panel titles,
// PromQL and units, scoped to this one host.
//
// One intentional deviation, fixing what looks like an authoring bug: the
// source "Network Usage" panel's transmit-bytes query used
// `vsphere_vm_net_bytesTx_average` (a *VM* metric) instead of
// `vsphere_host_net_bytesTx_average`, while its own receive-bytes query
// (and every other host-scoped panel here) correctly used a host metric -
// fixed to match.
function getHostDetailScene(host: string) {
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
              width: '12.5%',
              body: PanelBuilders.stat()
                .setTitle('ESXi VM Quick Overview')
                .setUnit('s')
                .setData(quickOverview)
                .setOverrides(applyClusterOrHostQuickOverviewOverrides)
                .build(),
            }),
            new SceneFlexItem({ width: '41.5%', body: ts('CPU Utilization Avg %', 'percent', cpuByCpu) }),
            new SceneFlexItem({ width: '25%', body: ts('RAM Utilization', 'percent', ramUtilization) }),
            new SceneFlexItem({ width: '21%', body: ts('CPU Ready in miliseconds', 'none', cpuReady) }),
          ],
        }),
        new SceneFlexLayout({
          direction: 'row',
          height: 460,
          children: [
            new SceneFlexItem({
              width: '54%',
              body: PanelBuilders.table().setTitle('Virtual Machines').setUnit('percent').setData(vmTable).setOverrides(applyVsphereDrilldownLinks).build(),
            }),
            new SceneFlexItem({
              width: '46%',
              body: new SceneFlexLayout({
                direction: 'column',
                children: [
                  new SceneFlexLayout({
                    direction: 'row',
                    children: [
                      new SceneFlexItem({ body: ts('Total Disk Latency', 'none', diskLatency) }),
                      new SceneFlexItem({ body: ts('Storage Adapter IOPS', 'short', storageIops) }),
                    ],
                  }),
                  new SceneFlexItem({ body: ts('Network Usage', 'KBs', network) }),
                ],
              }),
            }),
          ],
        }),
      ],
    }),
  });
}

function HostPageTitle({ title }: { title: string }) {
  return (
    <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
      {title}
      <Badge text="host" color="blue" />
      <InvestigateEntityButton kind="host" name={title} host={title} />
    </h1>
  );
}

function getHostDetailPage(routeMatch: SceneRouteMatch<{ host: string }>, parent: SceneAppPageLike) {
  const host = decodeURIComponent(routeMatch.params.host);

  return new SceneAppPage({
    title: host,
    renderTitle: (title) => <HostPageTitle title={title} />,
    url: `${HOSTS_URL}/${encodeURIComponent(host)}`,
    routePath: `${HOSTS_URL}/${encodeURIComponent(host)}`,
    getParentPage: () => parent,
    getScene: () => getHostDetailScene(host),
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
