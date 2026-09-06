// PromQL queries for a single Virtual Machine's detail page.
// Ported from /opt/vmware/vm.json. `f` is expected to carry a literal
// `vmname` matcher (e.g. `="app-server-01"`).
import { filterFragment, VsphereFilters } from './queryHelpers';

export const vmQueries = {
  // The raw metric selector (table format, instant) - Prometheus/Thanos'
  // table transform turns every label on the matched series into its own
  // column, including ones a `group by(...)` would otherwise drop (e.g.
  // `guest`, the VM's guest OS name) - used to drive the identity stat
  // tiles (VCENTER/CLUSTERNAME/ESXHOSTNAME/VMNAME/OSNAME) ported from
  // /opt/vmware/vm.json's panel-15..19.
  identityRow: (f: VsphereFilters) => `vsphere_vm_cpu_idle_summation{${filterFragment(f, ['vmname'])}, cpu="instance-total"}`,

  uptime: (f: VsphereFilters) => `vsphere_vm_sys_uptime_latest{${filterFragment(f, ['vmname'])}}`,
  cpuUsageMhz: (f: VsphereFilters) => `avg(vsphere_vm_cpu_usagemhz_average{${filterFragment(f, ['vmname'])}})`,
  ramUsageActive: (f: VsphereFilters) => `avg(vsphere_vm_mem_active_average{${filterFragment(f, ['vmname'])}})`,
  cpuUsagePercent: (f: VsphereFilters) => `avg(vsphere_vm_cpu_usage_average{${filterFragment(f, ['vmname'])}})`,
  ramUsagePercent: (f: VsphereFilters) => `avg(vsphere_vm_mem_usage_average{${filterFragment(f, ['vmname'])}})`,

  cpuReadyPercent: (f: VsphereFilters) => `avg(vsphere_vm_cpu_readiness_average{${filterFragment(f, ['vmname'])}})`,
  ramUtilizationPercent: (f: VsphereFilters) => `avg(vsphere_vm_mem_usage_average{${filterFragment(f, ['vmname'])}})`,
  cpuReadyMsByCore: (f: VsphereFilters) =>
    `avg by(cpu) (vsphere_vm_cpu_ready_summation{${filterFragment(f, ['vmname'])}})`,

  networkBytesTxByInterface: (f: VsphereFilters) =>
    `avg by(interface) (vsphere_vm_net_bytesTx_average{${filterFragment(f, ['vmname'])}})`,
  networkBytesRxByInterface: (f: VsphereFilters) =>
    `avg by(interface) (vsphere_vm_net_bytesRx_average{${filterFragment(f, ['vmname'])}})`,

  diskReadLatencyByDisk: (f: VsphereFilters) =>
    `avg by(disk) (vsphere_vm_virtualDisk_totalReadLatency_average{${filterFragment(f, ['vmname'])}})`,
  diskWriteLatencyByDisk: (f: VsphereFilters) =>
    `avg by(disk) (vsphere_vm_virtualDisk_totalWriteLatency_average{${filterFragment(f, ['vmname'])}})`,
  diskReadIops: (f: VsphereFilters) =>
    `avg(vsphere_vm_virtualDisk_numberReadAveraged_average{${filterFragment(f, ['vmname'])}})`,
  diskWriteIops: (f: VsphereFilters) =>
    `avg(vsphere_vm_virtualDisk_numberWriteAveraged_average{${filterFragment(f, ['vmname'])}})`,
};
