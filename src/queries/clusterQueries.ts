// PromQL queries for a single Cluster's detail page.
// Ported from /opt/vmware/cluster.json. `f` is expected to carry literal
// `vcenter`/`clustername` matchers (e.g. `="prod01"`) since these are always
// scoped to exactly one cluster on the detail page.
import { filterFragment, VsphereFilters } from './queryHelpers';

export const clusterQueries = {
  uptime: (f: VsphereFilters) =>
    `avg(vsphere_host_sys_uptime_latest{${filterFragment(f, ['vcenter', 'clustername'])}})`,
  cpuUsageMhz: (f: VsphereFilters) =>
    `sum(vsphere_host_cpu_usagemhz_average{${filterFragment(f, ['vcenter', 'clustername'])}})`,
  ramUsageBytes: (f: VsphereFilters) =>
    `sum((vsphere_host_mem_totalCapacity_average{${filterFragment(f, ['vcenter', 'clustername'])}} / 100) * vsphere_host_mem_usage_average{${filterFragment(f, ['vcenter', 'clustername'])}}) * 1024`,
  cpuUsagePercent: (f: VsphereFilters) =>
    `100 / sum(vsphere_host_cpu_totalCapacity_average{${filterFragment(f, ['vcenter', 'clustername'])}}) * sum(vsphere_host_cpu_usagemhz_average{${filterFragment(f, ['vcenter', 'clustername'])}})`,
  ramUsagePercent: (f: VsphereFilters) =>
    `avg(vsphere_host_mem_usage_average{${filterFragment(f, ['vcenter', 'clustername'])}})`,

  // Capacity headroom modeling: how busy the cluster is relative to losing
  // one of two redundant datacenters (RZ = Rechenzentrum), and relative to
  // running on both.
  cpuWorkloadVsOneDatacenter: (f: VsphereFilters) =>
    `100 / (sum(vsphere_host_cpu_totalCapacity_average{${filterFragment(f, ['vcenter', 'clustername'])}}) / 2) * sum(vsphere_host_cpu_usagemhz_average{${filterFragment(f, ['vcenter', 'clustername'])}}) / 100 * 110`,
  cpuFailoverCapacity: (f: VsphereFilters) =>
    `sum(vsphere_host_cpu_totalCapacity_average{${filterFragment(f, ['vcenter', 'clustername'])}}) / 2`,
  cpuTotalCapacityBothDatacenters: (f: VsphereFilters) =>
    `sum(vsphere_host_cpu_totalCapacity_average{${filterFragment(f, ['vcenter', 'clustername'])}})`,

  cpuReadyPercentByHost: (f: VsphereFilters) =>
    `avg by(esxhostname) (vsphere_host_cpu_readiness_average{${filterFragment(f, ['vcenter', 'clustername'])}})`,

  networkBytesRxByInterface: (f: VsphereFilters) =>
    `sum by(interface) (vsphere_host_net_bytesRx_average{${filterFragment(f, ['vcenter', 'clustername'])}})`,
  networkBytesTxByInterface: (f: VsphereFilters) =>
    `sum by(interface) (vsphere_host_net_bytesTx_average{${filterFragment(f, ['vcenter', 'clustername'])}})`,

  storageAdapterReadIops: (f: VsphereFilters) =>
    `sum by(adapter) (vsphere_host_storageAdapter_numberReadAveraged_average{${filterFragment(f, ['vcenter', 'clustername'])}})`,
  storageAdapterWriteIops: (f: VsphereFilters) =>
    `sum by(adapter) (vsphere_host_storageAdapter_numberWriteAveraged_average{${filterFragment(f, ['vcenter', 'clustername'])}})`,

  hostUptimeTable: (f: VsphereFilters) =>
    `group by(clustername, esxhostname, vcenter) (vsphere_host_sys_uptime_latest{${filterFragment(f, ['vcenter', 'clustername'])}})`,
};
