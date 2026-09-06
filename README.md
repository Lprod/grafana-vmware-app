# VMware vSphere App for Grafana

Observability for VMware vSphere (vCenter, Clusters, ESXi Hosts, Virtual Machines), built on the
Telegraf vSphere input plugin's metrics scraped by Prometheus/Thanos.

Structured after the sibling `debeka-k8s-app` (Kubernetes) plugin: a single Grafana app plugin
built with `@grafana/scenes`, with no embedded dashboard JSON — every page is built
programmatically from PromQL against the configured Prometheus/Thanos datasource.

## Pages

- **Search** — free-text search across vCenters, clusters, hosts and VMs, with results linking
  straight into the relevant detail page.
- **Overview** — fleet-wide view across all vCenters/clusters/hosts/VMs, filterable by any of them.
- **Clusters** — list of clusters with key metrics, drilling down into a per-cluster detail page
  (capacity vs. one/both datacenters, CPU readiness per host, network, storage IOPS, host list).
- **Hosts** — list of ESXi hosts, drilling down into a per-host detail page (CPU/RAM, network,
  disk latency, storage adapter IOPS, VMs running on that host).
- **Virtual Machines** — list of VMs, drilling down into a per-VM detail page (CPU/RAM/network/disk).
- **Compare** — pick an explicit set of hosts, VMs or clusters and see them side by side: a joined
  table of key metrics plus overlaid CPU/RAM trend panels, so an outlier stands out against its peers.
- **Configuration** (admin only) — pick the default Prometheus/Thanos datasource for vSphere metrics.

Grafana's own AI assistant app (`grafana-assistant-app`) is provisioned alongside this app (see
`provisioning/plugins/apps.yaml`) so operators can ask it questions about what's on screen.

## Development

See `.config/AGENTS/instructions.md` and the scripts in `package.json` (`npm run dev`,
`npm run server`, `npm run test`, `npm run e2e`) — this scaffolding is shared with `debeka-k8s-app`.
