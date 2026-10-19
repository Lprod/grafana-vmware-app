// PromQL queries for the vCenters list page and a single vCenter's detail
// page - the one level of the vcenter/cluster/host/vm hierarchy this app
// previously had no dedicated page for (vcenter only existed as a filter
// variable and a Search category). `f` carries a literal `vcenter` matcher
// on the detail page, a `=~"$vcenter"` regex matcher on the list page.
import { filterFragment, VsphereFilters } from './queryHelpers';

export const vcenterQueries = {
  clusterCount: (f: VsphereFilters) =>
    `count by (vcenter) (count by (vcenter, clustername) (vsphere_host_cpu_totalCapacity_average{${filterFragment(f, ['vcenter'])}}))`,
  // vsphere_host_cpu_totalCapacity_average carries no `cpu` label (unlike
  // vsphere_host_cpu_usage_average) - it's already one row per host, no
  // instance-total filter needed or possible.
  hostCount: (f: VsphereFilters) =>
    `count by (vcenter) (vsphere_host_cpu_totalCapacity_average{${filterFragment(f, ['vcenter'])}})`,
  vmCount: (f: VsphereFilters) =>
    `count by (vcenter) (vsphere_vm_mem_usage_average{${filterFragment(f, ['vcenter'])}})`,
  cpuUsagePercent: (f: VsphereFilters) =>
    `avg by (vcenter) (vsphere_host_cpu_usage_average{${filterFragment(f, ['vcenter'])}, cpu="instance-total"})`,
  ramUsagePercent: (f: VsphereFilters) =>
    `avg by (vcenter) (vsphere_host_mem_usage_average{${filterFragment(f, ['vcenter'])}})`,

  // Detail page: this vCenter's own clusters, one row each.
  clustersTable: (f: VsphereFilters) =>
    `count by (vcenter, clustername) (vsphere_host_cpu_totalCapacity_average{${filterFragment(f, ['vcenter'])}})`,
  clusterCpuUsagePercent: (f: VsphereFilters) =>
    `avg by (clustername) (vsphere_host_cpu_usage_average{${filterFragment(f, ['vcenter'])}, cpu="instance-total"})`,
  clusterRamUsagePercent: (f: VsphereFilters) =>
    `avg by (clustername) (vsphere_host_mem_usage_average{${filterFragment(f, ['vcenter'])}})`,

  // Detail page: fleet-wide timeseries, broken out by cluster/host.
  clusterCpuUsageTimeseries: (f: VsphereFilters) =>
    `avg by (clustername) (vsphere_host_cpu_usage_average{${filterFragment(f, ['vcenter'])}, cpu="instance-total"})`,
  clusterRamUsageTimeseries: (f: VsphereFilters) =>
    `avg by (clustername) (vsphere_host_mem_usage_average{${filterFragment(f, ['vcenter'])}})`,
  hostNetworkUsage: (f: VsphereFilters) =>
    `avg by (esxhostname) (vsphere_host_net_usage_average{${filterFragment(f, ['vcenter'])}})`,
};
