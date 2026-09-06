import pluginJson from './plugin.json';

export const PLUGIN_BASE_URL = `/a/${pluginJson.id}`;

export enum ROUTES {
  Search = 'search',
  Overview = 'overview',
  Clusters = 'clusters',
  Hosts = 'hosts',
  VMs = 'vms',
}

// Fall back to our demo stack's datasource UID until an admin sets a real
// default on the plugin's Configuration page.
export const DEFAULT_PROMETHEUS_UID = 'thanos-vmware-demo';
