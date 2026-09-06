// Shared helpers for building PromQL label selectors against the Telegraf
// vSphere input metrics (vsphere_host_*, vsphere_vm_*), scraped by
// Prometheus/Thanos. A "filter fragment" is a value already formatted as a
// full label match, e.g. '=~"$vcenter"' (scene-variable regex match, used in
// list/overview pages) or '="prod01.example.com"' (a literal equals match,
// used on single-entity detail pages).
export type VsphereFilters = {
  vcenter?: string;
  clustername?: string;
  esxhostname?: string;
  vmname?: string;
};

const FILTER_ORDER: Array<keyof VsphereFilters> = ['vcenter', 'clustername', 'esxhostname', 'vmname'];

// Builds a comma-separated PromQL label-matcher list, e.g.
// `vcenter=~"$vcenter", clustername="prod-cluster"`. Only keys present in
// `filters` (intersected with `keys`, if given) are included, so callers can
// scope a query down to just the labels that are meaningful for that metric.
export function filterFragment(filters: VsphereFilters, keys: Array<keyof VsphereFilters> = FILTER_ORDER): string {
  return keys
    .filter((key) => filters[key])
    .map((key) => `${key}${filters[key]}`)
    .join(', ');
}

// Regex-escapes a literal entity name (vCenter/cluster/host/VM) so it can be
// safely embedded in a PromQL `=~` matcher without its special characters
// (e.g. a `.` in a hostname) being interpreted as regex syntax.
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// A literal `="value"` matcher fragment for use in `filterFragment`.
export function equals(value: string): string {
  return `="${value.replace(/"/g, '\\"')}"`;
}

// A regex `=~"pattern"` matcher fragment (values must already be regex-safe).
export function matches(pattern: string): string {
  return `=~"${pattern}"`;
}
