import { EmbeddedScene, PanelBuilders, SceneFlexItem, SceneFlexLayout } from '@grafana/scenes';
import { promRunner, query } from './sceneHelpers';
import { attachExploreMenus } from './panelExplore';
import { applyVsphereDrilldownLinks } from './drilldownLinks';
import { PanelTimeRangeCompare } from './panelTimeRangeCompare';

// Ported 1:1 from /opt/vmware/overview.json ("Cluster Status" / "Hypervisor
// Status" / "Virtual Machine Status" rows) - same panel titles, PromQL and
// units as the source dashboard, just with this app's own scene-variable
// names ($vcenter/$clustername/$esxhostname/$vmname) substituted in place of
// the dashboard's own ($vcenter/$clustername/$esxi/$virtualmachine).
//
// One intentional deviation: the source "vSphere Overview" stat panel
// (panel-142) is a plain host/VM count but was left with `unit: s` (seconds)
// in the source dashboard - almost certainly a copy-paste leftover, since
// formatting a count as a duration is meaningless. Rendered here as `unit:
// none` instead.
function pct(w: number) {
  return `${((w / 24) * 100).toFixed(2)}%`;
}

function row(children: SceneFlexItem[], height?: number) {
  return new SceneFlexLayout({ direction: 'row', height, children });
}

export function getOverviewScene() {
  // -- Cluster Status row --
  const hostUptimeTable = promRunner(
    [query('A', 'group by(clustername, esxhostname) (vsphere_host_sys_uptime_latest{vcenter=~"$vcenter", clustername=~"$clustername"})', '__auto')],
    { instant: true, format: 'table' }
  );
  const fleetSummary = promRunner(
    [
      query('A', 'count(vsphere_host_cpu_totalCapacity_average{vcenter=~"$vcenter"})', 'ESXi Summary'),
      query('B', 'count(vsphere_vm_mem_usage_average{vcenter=~"$vcenter"})', 'VM Summary'),
    ],
    { instant: true }
  );
  const clusterCpuUsage = promRunner([
    query('A', 'avg by(clustername, cpu) (vsphere_host_cpu_usage_average{vcenter=~"$vcenter", clustername=~"$clustername", cpu="instance-total"})', '{{clustername}}'),
  ]);
  const clusterRamUsage = promRunner([
    query('A', 'avg by(clustername) (vsphere_host_mem_usage_average{vcenter=~"$vcenter", clustername=~"$clustername"})', '{{clustername}}'),
  ]);
  const clusterNetUsage = promRunner([
    query('A', 'avg by(clustername) (vsphere_host_net_bytesRx_average{vcenter=~"$vcenter", clustername=~"$clustername"})', '{{clustername}} - Received'),
    query('B', 'avg by(clustername) (vsphere_host_net_bytesTx_average{vcenter=~"$vcenter", clustername=~"$clustername"})', '{{clustername}} - Transmited'),
  ]);

  // -- Hypervisor Status row --
  const hypervisorCpu = promRunner([query('A', 'avg by(esxhostname) (vsphere_host_cpu_usage_average{esxhostname=~"$esxhostname", cpu="instance-total"})', '{{esxhostname}}')]);
  const hypervisorMem = promRunner([query('A', 'avg by(esxhostname) (vsphere_host_mem_usage_average{esxhostname=~"$esxhostname"})', '{{esxhostname}} mem usage average')]);
  const hypervisorNet = promRunner([query('A', 'avg by(esxhostname) (vsphere_host_net_usage_average{esxhostname=~"$esxhostname"})', '{{esxhostname}} net usage average')]);
  const vcenterCpuRam = promRunner([
    query('A', 'avg by(vcenter) (vsphere_vm_cpu_usage_average{vcenter=~"$vcenter", cpu="instance-total"})', '{{vcenter}} CPU'),
    query('B', 'avg by(vcenter) (vsphere_vm_mem_usage_average{vcenter=~"$vcenter"})', '{{vcenter}} RAM'),
  ]);

  // -- Virtual Machine Status row --
  const vmCpuUsage = promRunner([query('A', 'avg by(vmname) (vsphere_vm_cpu_usage_average{vmname=~"$vmname", cpu="instance-total"})', '{{vmname}}')]);
  const vmMemUsage = promRunner([query('A', 'avg by(vmname) (vsphere_vm_mem_usage_average{vmname=~"$vmname"})', '{{vmname}}')]);
  const vmCpuReady = promRunner([query('A', 'avg by(vmname) (vsphere_vm_cpu_ready_summation{vmname=~"$vmname"})', '__auto')]);
  const vmNetUsage = promRunner([query('A', 'avg by(vmname) (vsphere_vm_net_usage_average{vmname=~"$vmname"})', '__auto')]);
  const vmDiskReadIops = promRunner([query('A', 'avg by(vmname) (vsphere_vm_virtualDisk_numberReadAveraged_average{vmname=~"$vmname"})', '__auto')]);
  const vmDiskWriteIops = promRunner([query('A', 'avg by(vmname) (vsphere_vm_virtualDisk_numberWriteAveraged_average{vmname=~"$vmname"})', '__auto')]);
  const vmDiskLatency = promRunner([
    query('A', 'avg by(vmname) (vsphere_vm_virtualDisk_totalReadLatency_average{vmname=~"$vmname"})', '{{vmname}} - Read'),
    query('B', 'avg by(vmname) (vsphere_vm_virtualDisk_totalWriteLatency_average{vmname=~"$vmname"})', '{{vmname}} - Write'),
  ]);

  const ts = (
    title: string,
    unit: string,
    data: ReturnType<typeof promRunner>,
  ) =>
    PanelBuilders.timeseries().setTitle(title).setUnit(unit).setData(data).setHeaderActions(new PanelTimeRangeCompare()).build();

  return new EmbeddedScene({
    $behaviors: [attachExploreMenus],
    body: new SceneFlexLayout({
      direction: 'column',
      children: [
        row([
          new SceneFlexItem({
            width: pct(4),
            body: PanelBuilders.table().setTitle('').setUnit('s').setData(hostUptimeTable).setOverrides(applyVsphereDrilldownLinks).build(),
          }),
          new SceneFlexItem({
            width: pct(20),
            body: new SceneFlexLayout({
              direction: 'column',
              children: [
                new SceneFlexItem({ height: 120, body: PanelBuilders.stat().setTitle('vSphere Overview').setUnit('none').setData(fleetSummary).build() }),
                row([
                  new SceneFlexItem({ width: pct(7), body: ts('Cluster CPU Usage %', 'percent', clusterCpuUsage) }),
                  new SceneFlexItem({ width: pct(7), body: ts('Cluster RAM Usage in %', 'percent', clusterRamUsage) }),
                  new SceneFlexItem({ width: pct(6), body: ts('Cluster Network Usage', 'KBs', clusterNetUsage) }),
                ]),
              ],
            }),
          }),
        ], 340),
        row([
          new SceneFlexItem({ width: pct(6), body: ts('Hypervisor CPU', 'percent', hypervisorCpu) }),
          new SceneFlexItem({ width: pct(6), body: ts('Hypervisor Memory', 'percent', hypervisorMem) }),
          new SceneFlexItem({ width: pct(6), body: ts('Hypervisor Net Usage', 'KBs', hypervisorNet) }),
          new SceneFlexItem({ width: pct(6), body: ts('vCenter CPU/RAM', 'percent', vcenterCpuRam) }),
        ], 260),
        row([
          new SceneFlexItem({ width: pct(6), body: ts('Virtual Machine CPU Usage in %', 'percent', vmCpuUsage) }),
          new SceneFlexItem({ width: pct(6), body: ts('Virtual Machine Memory Usage Avg.', 'percent', vmMemUsage) }),
          new SceneFlexItem({ width: pct(6), body: ts('Virtual Machine CPU READY ms', 'ms', vmCpuReady) }),
          new SceneFlexItem({ width: pct(6), body: ts('Virtual Machine Network Usage Avg (Kbps)', 'KBs', vmNetUsage) }),
        ], 260),
        row([
          new SceneFlexItem({ width: pct(8), body: ts('Virtual Machine Disk Performance (Read VMFS Block IOPS)', 'iops', vmDiskReadIops) }),
          new SceneFlexItem({ width: pct(8), body: ts('Virtual Machine Disk Performance (Write VMFS Block IOPS)', 'iops', vmDiskWriteIops) }),
          new SceneFlexItem({ width: pct(8), body: ts('Virtual Machine Disk Performance (Block Latency Total)', 'ms', vmDiskLatency) }),
        ], 260),
      ],
    }),
  });
}
