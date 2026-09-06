import {
  SceneAppPage,
  SceneControlsSpacer,
  SceneRefreshPicker,
  SceneTimePicker,
  SceneTimeRange,
  SceneVariableSet,
  VariableValueControl,
} from '@grafana/scenes';
import { PLUGIN_BASE_URL, ROUTES } from '../constants';
import { getOverviewScene } from './overviewScene';
import {
  CLUSTER_VARIABLE_NAME,
  HOST_VARIABLE_NAME,
  THANOS_VARIABLE_NAME,
  VCENTER_VARIABLE_NAME,
  VM_VARIABLE_NAME,
  createClusterFilterVariable,
  createHostFilterVariable,
  createThanosDatasourceVariable,
  createVcenterFilterVariable,
  createVmFilterVariable,
} from '../variables/vsphereVariables';

export const OVERVIEW_URL = `${PLUGIN_BASE_URL}/${ROUTES.Overview}`;

export function getOverviewPage() {
  return new SceneAppPage({
    title: 'Overview',
    url: OVERVIEW_URL,
    routePath: `${ROUTES.Overview}/*`,
    getScene: getOverviewScene,
    $timeRange: new SceneTimeRange({ from: 'now-6h', to: 'now' }),
    $variables: new SceneVariableSet({
      variables: [
        createThanosDatasourceVariable(),
        createVcenterFilterVariable(),
        createClusterFilterVariable(),
        createHostFilterVariable(),
        createVmFilterVariable(),
      ],
    }),
    controls: [
      new VariableValueControl({ variableName: THANOS_VARIABLE_NAME }),
      new VariableValueControl({ variableName: VCENTER_VARIABLE_NAME }),
      new VariableValueControl({ variableName: CLUSTER_VARIABLE_NAME }),
      new VariableValueControl({ variableName: HOST_VARIABLE_NAME }),
      new VariableValueControl({ variableName: VM_VARIABLE_NAME }),
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
      `var-${CLUSTER_VARIABLE_NAME}`,
      `var-${HOST_VARIABLE_NAME}`,
      `var-${VM_VARIABLE_NAME}`,
    ],
  });
}
