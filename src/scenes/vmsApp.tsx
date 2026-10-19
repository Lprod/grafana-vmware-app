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
import { DataFrame } from '@grafana/data';
import { PLUGIN_BASE_URL, ROUTES } from '../constants';
import { vmQueries } from '../queries/vmQueries';
import { equals } from '../queries/queryHelpers';
import { promRunner, query } from './sceneHelpers';
import { attachExploreMenus } from './panelExplore';
import { applyVsphereDrilldownLinks } from './drilldownLinks';
import { PanelTimeRangeCompare } from './panelTimeRangeCompare';
import { applyVmQuickOverviewOverrides } from './quickOverviewOverrides';
import { EntityPageTitle } from './entityBadge';
import { InfoCard, findFieldAcrossFrames } from './infoCard';
import { UsageHealthBanner } from './healthBanner';
import { customCellOptions, UsagePercentCell } from './tableCells';
import React from 'react';
import {
  THANOS_VARIABLE_NAME,
  VM_VARIABLE_NAME,
  createThanosDatasourceVariable,
  createVmFilterVariable,
} from '../variables/vsphereVariables';
import { CLUSTERS_URL } from './clustersApp';
import { HOSTS_URL } from './hostsApp';

export const VMS_URL = `${PLUGIN_BASE_URL}/${ROUTES.VMs}`;

const usagePercentOverride = customCellOptions(UsagePercentCell);

function getVmsListScene() {
  const vmFilter = { vmname: '=~"$vmname"' };

  const queryRunner = new SceneQueryRunner({
    datasource: { uid: `\${${THANOS_VARIABLE_NAME}}` },
    queries: [
      {
        refId: 'info',
        expr: `group by (vcenter, clustername, esxhostname, vmname) (vsphere_vm_cpu_idle_summation{vmname=~"$vmname", cpu="instance-total"})`,
        format: 'table',
        instant: true,
      },
      { refId: 'cpu', expr: vmQueries.cpuUsagePercent(vmFilter), format: 'table', instant: true },
      { refId: 'mem', expr: vmQueries.ramUsagePercent(vmFilter), format: 'table', instant: true },
      { refId: 'ready', expr: vmQueries.cpuReadyPercent(vmFilter), format: 'table', instant: true },
    ],
  });

  const transformedData = new SceneDataTransformer({
    $data: queryRunner,
    transformations: [
      { id: 'joinByField', options: { byField: 'vmname', mode: 'outer' } },
      {
        id: 'organize',
        options: {
          excludeByName: { Time: true, 'Value #info': true },
          indexByName: {
            vmname: 0,
            esxhostname: 1,
            clustername: 2,
            vcenter: 3,
            'Value #cpu': 4,
            'Value #mem': 5,
            'Value #ready': 6,
          },
        },
      },
    ],
  });

  const table = PanelBuilders.table()
    .setTitle('Virtual machines')
    .setData(transformedData)
    .setOverrides((b) =>
      applyVsphereDrilldownLinks(b)
        .matchFieldsWithName('Value #cpu')
        .overrideDisplayName('CPU %')
        .overrideUnit('percent')
        .overrideCustomFieldConfig('cellOptions', usagePercentOverride)
        .matchFieldsWithName('Value #mem')
        .overrideDisplayName('RAM %')
        .overrideUnit('percent')
        .overrideCustomFieldConfig('cellOptions', usagePercentOverride)
        .matchFieldsWithName('Value #ready')
        .overrideDisplayName('CPU ready %')
        .overrideUnit('percent')
        .overrideCustomFieldConfig('cellOptions', usagePercentOverride)
    )
    .build();

  return new EmbeddedScene({
    $behaviors: [attachExploreMenus],
    body: new SceneFlexLayout({ direction: 'column', children: [new SceneFlexItem({ body: table })] }),
  });
}

// Overview tab: health banner -> identity info card (replacing the 5
// separate VCENTER/CLUSTERNAME/ESXHOSTNAME/VMNAME/OSNAME stat tiles with one
// card) + Quick Overview stat tile.
function getVmOverviewScene(vm: string) {
  const f = { vmname: equals(vm) };
  const q = vmQueries;

  const identity = promRunner([query('A', q.identityRow(f))], { instant: true, format: 'table' });
  const health = promRunner(
    [query('cpu', q.cpuUsagePercent(f)), query('mem', q.ramUsagePercent(f)), query('ready', q.cpuReadyPercent(f))],
    { instant: true, format: 'table' }
  );

  const quickOverview = promRunner(
    [
      query('A', q.uptime(f), 'Uptime'),
      query('B', q.cpuUsageMhz(f), 'CPU Usage MHz'),
      query('C', q.ramUsageActive(f), 'RAM Usage'),
      query('D', q.cpuUsagePercent(f), 'CPU Usage %'),
      query('E', q.ramUsagePercent(f), 'RAM Usage %'),
    ],
    { instant: true }
  );

  return new EmbeddedScene({
    $behaviors: [attachExploreMenus],
    body: new SceneFlexLayout({
      direction: 'column',
      children: [
        new SceneFlexItem({
          ySizing: 'content',
          body: new UsageHealthBanner({
            subject: 'Virtual machine',
            $data: health,
            cpuRefId: 'cpu',
            ramRefId: 'mem',
            readyRefId: 'ready',
          }),
        }),
        new SceneFlexLayout({
          direction: 'row',
          height: 220,
          children: [
            new SceneFlexItem({
              width: '33%',
              body: new InfoCard({
                title: 'VM information',
                $data: identity,
                rows: [
                  { label: 'Guest OS', fieldName: 'guest' },
                  { label: 'vCenter', fieldName: 'vcenter' },
                  {
                    label: 'Cluster',
                    fieldName: 'clustername',
                    href: (frames: DataFrame[]) => {
                      const cluster = findFieldAcrossFrames(frames, 'clustername');
                      return cluster ? `${CLUSTERS_URL}/${encodeURIComponent(cluster)}` : undefined;
                    },
                  },
                  {
                    label: 'ESXi host',
                    fieldName: 'esxhostname',
                    href: (frames: DataFrame[]) => {
                      const host = findFieldAcrossFrames(frames, 'esxhostname');
                      return host ? `${HOSTS_URL}/${encodeURIComponent(host)}` : undefined;
                    },
                  },
                ],
              }),
            }),
            new SceneFlexItem({
              width: '67%',
              body: PanelBuilders.stat()
                .setTitle('VM Quick Overview')
                .setData(quickOverview)
                .setOverrides(applyVmQuickOverviewOverrides)
                .build(),
            }),
          ],
        }),
      ],
    }),
  });
}

// Performance tab: the VM's CPU/RAM/network/storage charts.
function getVmPerformanceScene(vm: string) {
  const f = { vmname: equals(vm) };
  const q = vmQueries;

  const cpuUsage = promRunner([
    query('A', q.cpuReadyPercent(f), 'CPU Ready %'),
    query('B', q.cpuUsagePercent(f), 'CPU Usage %'),
  ]);
  const ramUsage = promRunner([query('A', q.ramUtilizationPercent(f), 'RAM Usage %')]);
  const cpuReadyMs = promRunner([query('A', q.cpuReadyMsByCore(f), 'Core {{cpu}}')]);
  const network = promRunner([
    query('A', q.networkBytesTxByInterface(f), '{{interface}} bytesTx'),
    query('B', q.networkBytesRxByInterface(f), '{{interface}} bytesRx'),
  ]);
  const diskLatency = promRunner([
    query('A', q.diskReadLatencyByDisk(f), 'Read - {{disk}}'),
    query('B', q.diskWriteLatencyByDisk(f), 'Write - {{disk}}'),
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
            new SceneFlexItem({ body: ts('CPU Usage in %', 'percent', cpuUsage) }),
            new SceneFlexItem({ body: ts('RAM Utilization', 'percent', ramUsage) }),
            new SceneFlexItem({ body: ts('CPU Ready in miliseconds', '', cpuReadyMs) }),
          ],
        }),
        new SceneFlexLayout({
          direction: 'row',
          height: 300,
          children: [
            new SceneFlexItem({ body: ts('Network Usage', 'KBs', network) }),
            new SceneFlexItem({ body: ts('Total Disk Latency', 'ms', diskLatency) }),
          ],
        }),
      ],
    }),
  });
}

function getVmDetailPage(routeMatch: SceneRouteMatch<{ vm: string }>, parent: SceneAppPageLike) {
  const vm = decodeURIComponent(routeMatch.params.vm);
  const baseUrl = `${VMS_URL}/${encodeURIComponent(vm)}`;

  const tabs = [
    { slug: 'overview', title: 'Overview', getScene: () => getVmOverviewScene(vm) },
    { slug: 'performance', title: 'Performance', getScene: () => getVmPerformanceScene(vm) },
  ].map(
    (tab) =>
      new SceneAppPage({ title: tab.title, url: `${baseUrl}/${tab.slug}`, routePath: tab.slug, getScene: tab.getScene })
  );

  return new SceneAppPage({
    title: vm,
    renderTitle: (title) => <EntityPageTitle title={title} investigate={{ kind: 'vm', name: title }} />,
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

export function getVmsPage() {
  return new SceneAppPage({
    title: 'Virtual Machines',
    url: VMS_URL,
    routePath: `${ROUTES.VMs}/*`,
    getScene: getVmsListScene,
    $timeRange: new SceneTimeRange({ from: 'now-1h', to: 'now' }),
    $variables: new SceneVariableSet({
      variables: [createThanosDatasourceVariable(), createVmFilterVariable()],
    }),
    controls: [
      new VariableValueControl({ variableName: THANOS_VARIABLE_NAME }),
      new VariableValueControl({ variableName: VM_VARIABLE_NAME }),
      new SceneControlsSpacer(),
      new SceneTimePicker({}),
      new SceneRefreshPicker({ refresh: '1m' }),
    ],
    preserveUrlKeys: ['from', 'to', 'timezone', 'refresh', `var-${THANOS_VARIABLE_NAME}`, `var-${VM_VARIABLE_NAME}`],
    drilldowns: [{ routePath: '/:vm/*', getPage: getVmDetailPage }],
  });
}
