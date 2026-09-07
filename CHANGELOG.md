# Changelog

## 1.0.1

- Fix: the Overview page's vCenter/Cluster/Host/VM filter variables failed with a "cannot parse parameter match[]" error whenever a selected value (e.g. a vCenter FQDN) contained regex-special characters like `.`. The `${var:regex}` variable-query interpolation produced PromQL string literals with invalid escape sequences; switched to plain `$var` interpolation, which the Prometheus/Thanos datasource escapes correctly.

## 1.0.0

Initial release.
