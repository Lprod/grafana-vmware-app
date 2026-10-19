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
import { vcenterQueries } from '../queries/vcenterQueries';
import { equals } from '../queries/queryHelpers';
import { promRunner, query } from './sceneHelpers';
import { attachExploreMenus } from './panelExplore';
import { applyVsphereDrilldownLinks } from './drilldownLinks';
import { PanelTimeRangeCompare } from './panelTimeRangeCompare';
import { customCellOptions, UsagePercentCell } from './tableCells';
import { EntityPageTitle } from './entityBadge';
import React from 'react';
import {
  VCENTER_VARIABLE_NAME,
  THANOS_VARIABLE_NAME,
  createThanosDatasourceVariable,
  createVcenterFilterVariable,
} from '../variables/vsphereVariables';

export const VCENTERS_URL = `${PLUGIN_BASE_URL}/${ROUTES.VCenters}`;

const usagePercentOverride = customCellOptions(UsagePercentCell);

function getVcentersListScene() {
  const queryRunner = new SceneQueryRunner({
    datasource: { uid: `\${${THANOS_VARIABLE_NAME}}` },
    queries: [
      {
        refId: 'clusters',
        expr: vcenterQueries.clusterCount({ vcenter: '=~"$vcenter"' }),
        format: 'table',
        instant: true,
      },
      { refId: 'hosts', expr: vcenterQueries.hostCount({ vcenter: '=~"$vcenter"' }), format: 'table', instant: true },
      { refId: 'vms', expr: vcenterQueries.vmCount({ vcenter: '=~"$vcenter"' }), format: 'table', instant: true },
      {
        refId: 'cpu',
        expr: vcenterQueries.cpuUsagePercent({ vcenter: '=~"$vcenter"' }),
        format: 'table',
        instant: true,
      },
      {
        refId: 'mem',
        expr: vcenterQueries.ramUsagePercent({ vcenter: '=~"$vcenter"' }),
        format: 'table',
        instant: true,
      },
    ],
  });

  const transformedData = new SceneDataTransformer({
    $data: queryRunner,
    transformations: [
      { id: 'joinByField', options: { byField: 'vcenter', mode: 'outer' } },
      {
        id: 'organize',
        options: {
          excludeByName: { Time: true },
          indexByName: {
            vcenter: 0,
            'Value #clusters': 1,
            'Value #hosts': 2,
            'Value #vms': 3,
            'Value #cpu': 4,
            'Value #mem': 5,
          },
        },
      },
    ],
  });

  const table = PanelBuilders.table()
    .setTitle('vCenters')
    .setData(transformedData)
    .setOverrides((b) =>
      applyVsphereDrilldownLinks(b)
        .matchFieldsWithName('Value #clusters')
        .overrideDisplayName('Clusters')
        .overrideUnit('none')
        .matchFieldsWithName('Value #hosts')
        .overrideDisplayName('Hosts')
        .overrideUnit('none')
        .matchFieldsWithName('Value #vms')
        .overrideDisplayName('VMs')
        .overrideUnit('none')
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

function getVcenterOverviewScene(vcenter: string) {
  const f = { vcenter: equals(vcenter) };
  const q = vcenterQueries;

  const clustersTable = new SceneDataTransformer({
    $data: new SceneQueryRunner({
      datasource: { uid: `\${${THANOS_VARIABLE_NAME}}` },
      queries: [
        { refId: 'info', expr: q.clustersTable(f), format: 'table', instant: true },
        { refId: 'cpu', expr: q.clusterCpuUsagePercent(f), format: 'table', instant: true },
        { refId: 'mem', expr: q.clusterRamUsagePercent(f), format: 'table', instant: true },
      ],
    }),
    transformations: [
      { id: 'joinByField', options: { byField: 'clustername', mode: 'outer' } },
      {
        id: 'organize',
        options: {
          excludeByName: { Time: true, vcenter: true },
          indexByName: { clustername: 0, 'Value #cpu': 1, 'Value #mem': 2 },
          renameByName: { 'Value #info': 'Hosts' },
        },
      },
    ],
  });

  const clustersPanel = PanelBuilders.table()
    .setTitle('Clusters')
    .setData(clustersTable)
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
    )
    .build();

  return new EmbeddedScene({
    $behaviors: [attachExploreMenus],
    body: new SceneFlexLayout({
      direction: 'column',
      children: [new SceneFlexItem({ body: clustersPanel })],
    }),
  });
}

function getVcenterPerformanceScene(vcenter: string) {
  const f = { vcenter: equals(vcenter) };
  const q = vcenterQueries;

  const clusterCpu = promRunner([query('A', q.clusterCpuUsageTimeseries(f), '{{clustername}}')]);
  const clusterRam = promRunner([query('A', q.clusterRamUsageTimeseries(f), '{{clustername}}')]);
  const hostNet = promRunner([query('A', q.hostNetworkUsage(f), '{{esxhostname}}')]);

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
          height: 300,
          children: [
            new SceneFlexItem({ body: ts('CPU Usage by cluster', 'percent', clusterCpu) }),
            new SceneFlexItem({ body: ts('RAM Usage by cluster', 'percent', clusterRam) }),
          ],
        }),
        new SceneFlexItem({ height: 300, body: ts('Network Usage by host', 'KBs', hostNet) }),
      ],
    }),
  });
}

function getVcenterDetailPage(routeMatch: SceneRouteMatch<{ vcenter: string }>, parent: SceneAppPageLike) {
  const vcenter = decodeURIComponent(routeMatch.params.vcenter);
  const baseUrl = `${VCENTERS_URL}/${encodeURIComponent(vcenter)}`;

  const tabs = [
    { slug: 'overview', title: 'Overview', getScene: () => getVcenterOverviewScene(vcenter) },
    { slug: 'performance', title: 'Performance', getScene: () => getVcenterPerformanceScene(vcenter) },
  ].map(
    (tab) =>
      new SceneAppPage({ title: tab.title, url: `${baseUrl}/${tab.slug}`, routePath: tab.slug, getScene: tab.getScene })
  );

  return new SceneAppPage({
    title: vcenter,
    renderTitle: (title) => <EntityPageTitle title={title} investigate={{ kind: 'vcenter', name: title }} />,
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

export function getVcentersPage() {
  return new SceneAppPage({
    title: 'vCenters',
    url: VCENTERS_URL,
    routePath: `${ROUTES.VCenters}/*`,
    getScene: getVcentersListScene,
    $timeRange: new SceneTimeRange({ from: 'now-1h', to: 'now' }),
    $variables: new SceneVariableSet({ variables: [createThanosDatasourceVariable(), createVcenterFilterVariable()] }),
    controls: [
      new VariableValueControl({ variableName: THANOS_VARIABLE_NAME }),
      new VariableValueControl({ variableName: VCENTER_VARIABLE_NAME }),
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
      `var-${VCENTER_VARIABLE_NAME}`,
    ],
    drilldowns: [{ routePath: '/:vcenter/*', getPage: getVcenterDetailPage }],
  });
}
