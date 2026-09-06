import { FieldConfigOverridesBuilder } from '@grafana/scenes';
import { PLUGIN_BASE_URL, ROUTES } from '../constants';

const CLUSTERS_URL = `${PLUGIN_BASE_URL}/${ROUTES.Clusters}`;
const HOSTS_URL = `${PLUGIN_BASE_URL}/${ROUTES.Hosts}`;
const VMS_URL = `${PLUGIN_BASE_URL}/${ROUTES.VMs}`;

/**
 * Adds this app's standard Drilldown links to whichever of the
 * `clustername`/`esxhostname`/`vmname` columns a table actually has.
 *
 * Matched on the raw Prometheus label name, not a column's displayed header,
 * so a `matchFieldsWithName` for a column the current query doesn't return
 * is simply a no-op - one shared override set is safe to reuse across
 * tables whose label sets differ (the Search page's per-category tables,
 * the Host detail page's "Virtual machines" table, etc).
 */
export function applyVsphereDrilldownLinks(b: FieldConfigOverridesBuilder<any>) {
  return b
    .matchFieldsWithName('clustername')
    .overrideLinks([{ title: 'View cluster', url: `${CLUSTERS_URL}/\${__value.text}\${__url.params}` }])
    .matchFieldsWithName('esxhostname')
    .overrideLinks([{ title: 'View host', url: `${HOSTS_URL}/\${__value.text}\${__url.params}` }])
    .matchFieldsWithName('vmname')
    .overrideLinks([{ title: 'View VM', url: `${VMS_URL}/\${__value.text}\${__url.params}` }]);
}
