import { DataSourceVariable, QueryVariable, TextBoxVariable } from '@grafana/scenes';
import { getDatasourceDefaults } from '../utils/appJsonData';

// Thanos is exposed to Grafana as a Prometheus-compatible datasource, so we
// pick from all configured "prometheus" datasources (Thanos included). This
// is where the Telegraf vSphere input plugin's metrics (vsphere_host_*,
// vsphere_vm_*, vsphere_datastore_*) live.
export const THANOS_VARIABLE_NAME = 'datasource';
export const VCENTER_VARIABLE_NAME = 'vcenter';
export const CLUSTER_VARIABLE_NAME = 'clustername';
export const HOST_VARIABLE_NAME = 'esxhostname';
export const VM_VARIABLE_NAME = 'vmname';
export const SEARCH_VARIABLE_NAME = 'search';

export function createThanosDatasourceVariable() {
  return new DataSourceVariable({
    name: THANOS_VARIABLE_NAME,
    label: 'Data source',
    pluginId: 'prometheus',
    value: getDatasourceDefaults().prometheusUid,
  });
}

export function createVcenterFilterVariable(options: { isMulti?: boolean } = {}) {
  const isMulti = options.isMulti ?? true;
  return new QueryVariable({
    name: VCENTER_VARIABLE_NAME,
    label: 'vCenter',
    datasource: { uid: `\${${THANOS_VARIABLE_NAME}}` },
    query: {
      refId: 'vcenterVariableQuery',
      query: 'label_values(vsphere_host_cpu_coreUtilization_average,vcenter)',
    },
    isMulti,
    includeAll: isMulti,
    allValue: isMulti ? '.+' : undefined,
    value: isMulti ? '$__all' : '',
  });
}

export function createClusterFilterVariable(options: { isMulti?: boolean } = {}) {
  const isMulti = options.isMulti ?? true;
  return new QueryVariable({
    name: CLUSTER_VARIABLE_NAME,
    label: 'Cluster',
    datasource: { uid: `\${${THANOS_VARIABLE_NAME}}` },
    query: {
      refId: 'clusterVariableQuery',
      query: `label_values(vsphere_host_cpu_coreUtilization_average{vcenter=~"\$${VCENTER_VARIABLE_NAME}"}, clustername)`,
    },
    isMulti,
    includeAll: isMulti,
    allValue: isMulti ? '.+' : undefined,
    value: isMulti ? '$__all' : '',
  });
}

export function createHostFilterVariable(options: { isMulti?: boolean } = {}) {
  const isMulti = options.isMulti ?? true;
  return new QueryVariable({
    name: HOST_VARIABLE_NAME,
    label: 'ESXi host',
    datasource: { uid: `\${${THANOS_VARIABLE_NAME}}` },
    query: {
      refId: 'hostVariableQuery',
      query: `label_values(vsphere_host_cpu_coreUtilization_average{vcenter=~"\$${VCENTER_VARIABLE_NAME}", clustername=~"\$${CLUSTER_VARIABLE_NAME}"}, esxhostname)`,
    },
    isMulti,
    includeAll: isMulti,
    allValue: isMulti ? '.+' : undefined,
    value: isMulti ? '$__all' : '',
  });
}

export function createSearchTextVariable() {
  return new TextBoxVariable({
    name: SEARCH_VARIABLE_NAME,
    label: 'Search',
    value: '',
  });
}

export function createVmFilterVariable(options: { isMulti?: boolean } = {}) {
  const isMulti = options.isMulti ?? true;
  return new QueryVariable({
    name: VM_VARIABLE_NAME,
    label: 'Virtual machine',
    datasource: { uid: `\${${THANOS_VARIABLE_NAME}}` },
    query: {
      refId: 'vmVariableQuery',
      query: `label_values(vsphere_vm_cpu_demand_average{vcenter=~"\$${VCENTER_VARIABLE_NAME}", clustername=~"\$${CLUSTER_VARIABLE_NAME}", esxhostname=~"\$${HOST_VARIABLE_NAME}"}, vmname)`,
    },
    isMulti,
    includeAll: isMulti,
    allValue: isMulti ? '.+' : undefined,
    value: isMulti ? '$__all' : '',
  });
}
