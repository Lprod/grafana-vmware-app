# Changelog

## 1.1.0

Design/UX alignment pass with the sibling `debeka-k8s-app` plugin, so both feel like the same product:

- New **vCenters** page (list + detail) — fills the previously-missing top level of the vcenter/cluster/host/vm hierarchy, with a Clusters table and CPU/RAM/network charts.
- List tables (Clusters/Hosts/VMs/vCenters) now render CPU/RAM/CPU-Ready columns as combined value+color+bar meter cells instead of plain numbers (wiring up the `tableCells.tsx` renderer that existed but was never used).
- Type-colored entity badges (vcenter/cluster/host/vm each their own color) next to every detail page's title, instead of all hardcoded blue.
- The vCenter column is now a clickable link everywhere it appears in a table.
- Press **"/"** anywhere in the app to jump straight to a vCenter/cluster/host/VM by name, with arrow-key navigation and Enter to open — same shortcut as the sibling Kubernetes app.
- Fix: the Clusters/Hosts/VMs list pages' CPU%/RAM%/CPU-Ready% columns were broken (missing entirely, or collapsed to a single fleet-wide number) whenever more than one entity was selected — the default "All" state every user sees on first load.
- Fix: a host's CPU usage % was averaged together with its own per-core breakdown rows, giving a slightly wrong number even on that host's own detail page.
- The Cluster/Host/VM Quick Overview stat tiles' usage thresholds (previously 70/85 vs. 70/90, duplicated three times) are now unified onto one shared 70/85 scale reused everywhere.

## 1.0.1

- Fix: the Overview page's vCenter/Cluster/Host/VM filter variables failed with a "cannot parse parameter match[]" error whenever a selected value (e.g. a vCenter FQDN) contained regex-special characters like `.`. The `${var:regex}` variable-query interpolation produced PromQL string literals with invalid escape sequences; switched to plain `$var` interpolation, which the Prometheus/Thanos datasource escapes correctly.

## 1.0.0

Initial release.
