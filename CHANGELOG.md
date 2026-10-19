# Changelog

## Unreleased

- Design/UX alignment pass with the sibling `debeka-k8s-app` plugin, so both feel like the same product: a new **vCenters** page (list + Overview/Performance drilldown) fills the previously-missing top level of the vcenter/cluster/host/vm hierarchy; list tables now render CPU/RAM/CPU-Ready columns as combined value+color+bar meter cells (wiring up the `tableCells.tsx` renderer that existed but was never used); every drilldown page got a usage-derived health banner, a metadata `InfoCard` (replacing the VM page's 5 separate identity stat tiles), a type-colored entity badge (vcenter/cluster/host/vm each their own color, previously all hardcoded blue), and an Overview/Performance tab split instead of one long flat panel list; the Cluster/Host/VM Quick Overview stat tiles' usage thresholds (previously 70/85 vs. 70/90, duplicated three times) are now unified onto one shared 70/85 scale reused everywhere.

## 1.0.1

- Fix: the Overview page's vCenter/Cluster/Host/VM filter variables failed with a "cannot parse parameter match[]" error whenever a selected value (e.g. a vCenter FQDN) contained regex-special characters like `.`. The `${var:regex}` variable-query interpolation produced PromQL string literals with invalid escape sequences; switched to plain `$var` interpolation, which the Prometheus/Thanos datasource escapes correctly.

## 1.0.0

Initial release.
