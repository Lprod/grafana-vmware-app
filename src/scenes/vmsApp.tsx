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
import { vmQueries } from '../queries/vmQueries';
import { equals } from '../queries/queryHelpers';
import { promRunner, query } from './sceneHelpers';
import { attachExploreMenus } from './panelExplore';
import { applyVsphereDrilldownLinks } from './drilldownLinks';
import { PanelTimeRangeCompare } from './panelTimeRangeCompare';
import { applyVmQuickOverviewOverrides } from './quickOverviewOverrides';
import { InvestigateEntityButton } from './investigateEntityButton';
import React from 'react';
import { Badge } from '@grafana/ui';
import {
  THANOS_VARIABLE_NAME,
  VM_VARIABLE_NAME,
  createThanosDatasourceVariable,
  createVmFilterVariable,
} from '../variables/vsphereVariables';

export const VMS_URL = `${PLUGIN_BASE_URL}/${ROUTES.VMs}`;

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
          excludeByName: { Time: true, Value: true },
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
        .matchFieldsWithName('Value #mem')
        .overrideDisplayName('RAM %')
        .overrideUnit('percent')
        .matchFieldsWithName('Value #ready')
        .overrideDisplayName('CPU ready %')
        .overrideUnit('percent')
    )
    .build();

  return new EmbeddedScene({
    $behaviors: [attachExploreMenus],
    body: new SceneFlexLayout({ direction: 'column', children: [new SceneFlexItem({ body: table })] }),
  });
}

// Identity stat tile ported from vm.json's panel-15..19: each is its own
// `format: table, instant: true` query against the raw metric selector (so
// every label - vcenter/clustername/esxhostname/vmname/guest - comes back as
// its own column), reduced down to just the one label named in `field`.
function identityTile(title: string, field: string, data: ReturnType<typeof promRunner>) {
  return PanelBuilders.stat()
    .setTitle(title)
    .setOption('reduceOptions' as any, { calcs: ['lastNotNull'], fields: `/^${field}$/`, values: false } as any)
    .setData(data)
    .build();
}

// Detail page ported 1:1 from /opt/vmware/vm.json - same panel titles,
// PromQL and units, scoped to this one VM.
function getVmDetailScene(vm: string) {
  const f = { vmname: equals(vm) };
  const q = vmQueries;

  const vcenterRow = promRunner([query('A', q.identityRow(f))], { instant: true, format: 'table' });
  const clusterRow = promRunner([query('A', q.identityRow(f))], { instant: true, format: 'table' });
  const hostRow = promRunner([query('A', q.identityRow(f))], { instant: true, format: 'table' });
  const vmRow = promRunner([query('A', q.identityRow(f))], { instant: true, format: 'table' });
  const osRow = promRunner([query('A', q.identityRow(f))], { instant: true, format: 'table' });

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
    PanelBuilders.timeseries().setTitle(title).setUnit(unit).setData(data).setHeaderActions(new PanelTimeRangeCompare()).build();

  return new EmbeddedScene({
    $behaviors: [attachExploreMenus],
    body: new SceneFlexLayout({
      direction: 'column',
      children: [
        new SceneFlexLayout({
          direction: 'row',
          height: 90,
          children: [
            new SceneFlexItem({ width: '25%', body: identityTile('VCENTER', 'vcenter', vcenterRow) }),
            new SceneFlexItem({ width: '17%', body: identityTile('CLUSTERNAME', 'clustername', clusterRow) }),
            new SceneFlexItem({ width: '25%', body: identityTile('ESXHOSTNAME', 'esxhostname', hostRow) }),
            new SceneFlexItem({ width: '17%', body: identityTile('VMNAME', 'vmname', vmRow) }),
            new SceneFlexItem({ width: '16%', body: identityTile('OSNAME', 'guest', osRow) }),
          ],
        }),
        new SceneFlexLayout({
          direction: 'row',
          height: 260,
          children: [
            new SceneFlexItem({
              width: '25%',
              body: PanelBuilders.stat()
                .setTitle('VM Quick Overview')
                .setData(quickOverview)
                .setOverrides(applyVmQuickOverviewOverrides)
                .build(),
            }),
            new SceneFlexItem({ width: '29%', body: ts('CPU Usage in %', 'percent', cpuUsage) }),
            new SceneFlexItem({ width: '25%', body: ts('RAM Utilization', 'percent', ramUsage) }),
            new SceneFlexItem({ width: '21%', body: ts('CPU Ready in miliseconds', '', cpuReadyMs) }),
          ],
        }),
        new SceneFlexLayout({
          direction: 'row',
          height: 300,
          children: [
            new SceneFlexItem({ width: '54%', body: ts('Network Usage', 'KBs', network) }),
            new SceneFlexItem({ width: '46%', body: ts('Total Disk Latency', 'ms', diskLatency) }),
          ],
        }),
      ],
    }),
  });
}

function VmPageTitle({ title }: { title: string }) {
  return (
    <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
      {title}
      <Badge text="vm" color="blue" />
      <InvestigateEntityButton kind="vm" name={title} />
    </h1>
  );
}

function getVmDetailPage(routeMatch: SceneRouteMatch<{ vm: string }>, parent: SceneAppPageLike) {
  const vm = decodeURIComponent(routeMatch.params.vm);

  return new SceneAppPage({
    title: vm,
    renderTitle: (title) => <VmPageTitle title={title} />,
    url: `${VMS_URL}/${encodeURIComponent(vm)}`,
    routePath: `${VMS_URL}/${encodeURIComponent(vm)}`,
    getParentPage: () => parent,
    getScene: () => getVmDetailScene(vm),
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
