// PromQL queries for the VMware Search page - one topk(10, ...) query per
// entity kind, each already carrying its own "search box" name filter as a
// literal `=~".*.*"` placeholder (empty search = ".*" + "" + ".*", i.e. no
// filtering) - same pattern as debeka-k8s-app's searchQueries.ts.
export const searchTableQueries = {
  vcenters: `topk(10, last_over_time(group by (vcenter) (vsphere_host_cpu_coreUtilization_average{vcenter=~".*.*"})[$__range:]))`,
  clusters: `topk(10, last_over_time(group by (vcenter, clustername) (vsphere_host_cpu_coreUtilization_average{clustername=~".*.*"})[$__range:]))`,
  hosts: `topk(10, last_over_time(group by (vcenter, clustername, esxhostname) (vsphere_host_cpu_coreUtilization_average{esxhostname=~".*.*"})[$__range:]))`,
  vms: `topk(10, last_over_time(group by (vcenter, clustername, esxhostname, vmname) (vsphere_vm_cpu_demand_average{vmname=~".*.*"})[$__range:]))`,
};

export type SearchTableQueryKey = keyof typeof searchTableQueries;

// Every query's own name-filter placeholder is the literal `.*.*"` above -
// swapped here for the live, already regex-escaped search box value
// (`${search:regex}`, see createSearchTextVariable) so typing into the
// search box re-filters every table's own name column.
export function substituteSearch(expr: string, searchRegex: string): string {
  return expr.replaceAll('.*.*"', `.*${searchRegex}.*"`);
}

export function buildSearchTarget(key: SearchTableQueryKey, searchRegex: string) {
  return {
    refId: key,
    expr: substituteSearch(searchTableQueries[key], searchRegex),
    format: 'table' as const,
    instant: true,
  };
}
