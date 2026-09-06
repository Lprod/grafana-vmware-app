// PromQL queries for a single ESXi Host's detail page.
// Ported from /opt/vmware/hosts.json. `f` is expected to carry a literal
// `esxhostname` matcher (e.g. `="esx01.example.com"`).
import { filterFragment, VsphereFilters } from './queryHelpers';

export const hostQueries = {
  uptime: (f: VsphereFilters) => `vsphere_host_sys_uptime_latest{${filterFragment(f, ['esxhostname'])}}`,
  cpuUsageMhz: (f: VsphereFilters) => `vsphere_host_cpu_usagemhz_average{${filterFragment(f, ['esxhostname'])}}`,
  ramUsageBytes: (f: VsphereFilters) =>
    `vsphere_host_mem_totalCapacity_average{${filterFragment(f, ['esxhostname'])}} * vsphere_host_mem_usage_average{${filterFragment(f, ['esxhostname'])}} / 100 * 1024`,
  cpuUsagePercent: (f: VsphereFilters) => `avg(vsphere_host_cpu_usage_average{${filterFragment(f, ['esxhostname'])}})`,
  ramUsagePercent: (f: VsphereFilters) => `vsphere_host_mem_usage_average{${filterFragment(f, ['esxhostname'])}}`,

  cpuUtilizationAvgPercentByCpu: (f: VsphereFilters) =>
    `avg by(cpu) (vsphere_host_cpu_usage_average{${filterFragment(f, ['esxhostname'])}})`,
  ramUtilizationPercent: (f: VsphereFilters) =>
    `avg(vsphere_host_mem_usage_average{${filterFragment(f, ['esxhostname'])}})`,
  cpuReadyMs: (f: VsphereFilters) => `vsphere_host_cpu_ready_summation{${filterFragment(f, ['esxhostname'])}}`,

  networkBytesRxByInterface: (f: VsphereFilters) =>
    `avg by(interface) (vsphere_host_net_bytesRx_average{${filterFragment(f, ['esxhostname'])}})`,
  networkBytesTxByInterface: (f: VsphereFilters) =>
    `avg by(interface) (vsphere_host_net_bytesTx_average{${filterFragment(f, ['esxhostname'])}})`,

  diskReadLatencyByDisk: (f: VsphereFilters) =>
    `avg by(disk) (vsphere_host_disk_totalReadLatency_average{${filterFragment(f, ['esxhostname'])}})`,
  diskWriteLatencyByDisk: (f: VsphereFilters) =>
    `avg by(disk) (vsphere_host_disk_totalWriteLatency_average{${filterFragment(f, ['esxhostname'])}})`,

  storageAdapterReadIops: (f: VsphereFilters) =>
    `avg by(adapter) (vsphere_host_storageAdapter_numberReadAveraged_average{${filterFragment(f, ['esxhostname'])}})`,
  storageAdapterWriteIops: (f: VsphereFilters) =>
    `avg by(adapter) (vsphere_host_storageAdapter_numberWriteAveraged_average{${filterFragment(f, ['esxhostname'])}})`,

  // Only the mem query carries the identifying columns (clustername/
  // esxhostname/vcenter) - the cpu query groups by vmname alone, so
  // joinByField(vmname) merges the two into one row per VM without
  // producing duplicate "vcenter 1"/"clustername 1" columns.
  vmMemUsageTable: (f: VsphereFilters) =>
    `avg by(vmname, clustername, esxhostname, vcenter) (vsphere_vm_mem_usage_average{${filterFragment(f, ['vcenter', 'clustername', 'esxhostname'])}})`,
  vmCpuUsageTable: (f: VsphereFilters) =>
    `avg by(vmname) (vsphere_vm_cpu_usage_average{${filterFragment(f, ['vcenter', 'clustername', 'esxhostname'])}})`,
};
