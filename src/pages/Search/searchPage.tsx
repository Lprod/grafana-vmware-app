import React, { useEffect, useMemo, useState } from 'react';
import {
  EmbeddedScene,
  SceneAppPage,
  SceneControlsSpacer,
  SceneDataTransformer,
  SceneFlexItem,
  SceneFlexLayout,
  SceneQueryRunner,
  SceneReactObject,
  SceneRefreshPicker,
  SceneTimePicker,
  SceneTimeRange,
  SceneVariableSet,
  TextBoxVariable,
  VariableValueControl,
  PanelBuilders,
  FieldConfigOverridesBuilder,
} from '@grafana/scenes';
import { Alert, FilterPill, Icon, Input, useStyles2 } from '@grafana/ui';
import { DataFrame, GrafanaTheme2 } from '@grafana/data';
import { css } from '@emotion/css';
import { PLUGIN_BASE_URL, ROUTES } from '../../constants';
import { buildSearchTarget, SearchTableQueryKey } from '../../queries/searchQueries';
import {
  SEARCH_VARIABLE_NAME,
  THANOS_VARIABLE_NAME,
  createSearchTextVariable,
  createThanosDatasourceVariable,
} from '../../variables/vsphereVariables';
import { attachExploreMenus } from '../../scenes/panelExplore';

const SEARCH_URL = `${PLUGIN_BASE_URL}/${ROUTES.Search}`;
const OVERVIEW_URL = `${PLUGIN_BASE_URL}/${ROUTES.Overview}`;
const CLUSTERS_URL = `${PLUGIN_BASE_URL}/${ROUTES.Clusters}`;
const HOSTS_URL = `${PLUGIN_BASE_URL}/${ROUTES.Hosts}`;
const VMS_URL = `${PLUGIN_BASE_URL}/${ROUTES.VMs}`;

// Same "escaped live variable token spliced into the query text" pattern as
// debeka-k8s-app's Search page - `${search:regex}` is resolved by Scenes'
// variable interpolation at query-run time, not here.
const searchRegex = `\${${SEARCH_VARIABLE_NAME}:regex}`;

type Category = SearchTableQueryKey;
type Row = Record<string, string>;

const CATEGORY_ORDER: Category[] = ['vcenters', 'clusters', 'hosts', 'vms'];
const CATEGORY_LABELS: Record<Category, string> = {
  vcenters: 'vCenters',
  clusters: 'Clusters',
  hosts: 'Hosts',
  vms: 'Virtual machines',
};

const encode = (value: string) => encodeURIComponent(value);

function linkOverride(
  b: FieldConfigOverridesBuilder<any>,
  fieldName: string,
  displayName: string,
  url?: string
): FieldConfigOverridesBuilder<any> {
  const withName = b.matchFieldsWithName(fieldName).overrideDisplayName(displayName).overrideCustomFieldConfig('align', 'left');
  return url ? withName.overrideLinks([{ title: `View ${displayName.toLowerCase()}`, url }]) : withName;
}

// One definition per category: how to organize its columns for the
// committed table view, and how to resolve one matching row into an
// autocomplete suggestion (a primary name, an immediate-parent "secondary"
// line, and the URL a click navigates straight to) - same shape as
// debeka-k8s-app's CATEGORY_DEFS.
interface CategoryDef {
  title: string;
  indexByName: Record<string, number>;
  primaryField: string;
  secondaryField?: string;
  buildSuggestionUrl: (row: Row) => string;
  buildOverrides: (b: FieldConfigOverridesBuilder<any>) => FieldConfigOverridesBuilder<any>;
}

const CATEGORY_DEFS: Record<Category, CategoryDef> = {
  vcenters: {
    title: 'vCenters',
    indexByName: { vcenter: 0 },
    primaryField: 'vcenter',
    buildSuggestionUrl: (row) => `${OVERVIEW_URL}?var-vcenter=${encode(row.vcenter)}`,
    buildOverrides: (b) => linkOverride(b, 'vcenter', 'vCenter', `${OVERVIEW_URL}?var-vcenter=\${__value.text}`),
  },
  clusters: {
    title: 'Clusters',
    indexByName: { clustername: 0, vcenter: 1 },
    primaryField: 'clustername',
    secondaryField: 'vcenter',
    buildSuggestionUrl: (row) => `${CLUSTERS_URL}/${encode(row.clustername)}`,
    buildOverrides: (b) => {
      const withCluster = linkOverride(b, 'clustername', 'Cluster', `${CLUSTERS_URL}/\${__value.text}\${__url.params}`);
      return linkOverride(withCluster, 'vcenter', 'vCenter');
    },
  },
  hosts: {
    title: 'Hosts',
    indexByName: { esxhostname: 0, clustername: 1, vcenter: 2 },
    primaryField: 'esxhostname',
    secondaryField: 'clustername',
    buildSuggestionUrl: (row) => `${HOSTS_URL}/${encode(row.esxhostname)}`,
    buildOverrides: (b) => {
      const withHost = linkOverride(b, 'esxhostname', 'Host', `${HOSTS_URL}/\${__value.text}\${__url.params}`);
      const withCluster = linkOverride(withHost, 'clustername', 'Cluster', `${CLUSTERS_URL}/\${__value.text}\${__url.params}`);
      return linkOverride(withCluster, 'vcenter', 'vCenter');
    },
  },
  vms: {
    title: 'Virtual machines',
    indexByName: { vmname: 0, esxhostname: 1, clustername: 2, vcenter: 3 },
    primaryField: 'vmname',
    secondaryField: 'esxhostname',
    buildSuggestionUrl: (row) => `${VMS_URL}/${encode(row.vmname)}`,
    buildOverrides: (b) => {
      const withVm = linkOverride(b, 'vmname', 'VM', `${VMS_URL}/\${__value.text}\${__url.params}`);
      const withHost = linkOverride(withVm, 'esxhostname', 'Host', `${HOSTS_URL}/\${__value.text}\${__url.params}`);
      const withCluster = linkOverride(withHost, 'clustername', 'Cluster', `${CLUSTERS_URL}/\${__value.text}\${__url.params}`);
      return linkOverride(withCluster, 'vcenter', 'vCenter');
    },
  },
};

function mergeAndOrganize(indexByName: Record<string, number>) {
  return [
    { id: 'merge', options: {} },
    { id: 'organize', options: { excludeByName: { Time: true, Value: true }, indexByName, renameByName: {} } },
  ];
}

// One query+transform pipeline per category - built once per "mount" (see
// SearchControls below) and reused for both the committed table view and
// the live autocomplete dropdown's row data, so typing only triggers one
// query per active category, not two.
function buildCategoryPipeline(category: Category) {
  const def = CATEGORY_DEFS[category];
  const queryRunner = new SceneQueryRunner({
    datasource: { uid: `\${${THANOS_VARIABLE_NAME}}` },
    queries: [buildSearchTarget(category, searchRegex)],
  });
  const transformedData = new SceneDataTransformer({ $data: queryRunner, transformations: mergeAndOrganize(def.indexByName) });
  const panel = PanelBuilders.table().setTitle(def.title).setData(transformedData).setOverrides(def.buildOverrides).build();
  return { transformedData, panel };
}

function framesToRows(series: DataFrame[] | undefined): Row[] {
  if (!series) {
    return [];
  }
  const rows: Row[] = [];
  for (const frame of series) {
    for (let i = 0; i < frame.length; i++) {
      const row: Row = {};
      for (const field of frame.fields) {
        row[field.name] = String(field.values[i] ?? '');
      }
      rows.push(row);
    }
  }
  return rows;
}

function getStyles(theme: GrafanaTheme2) {
  return {
    wrapper: css({ position: 'relative' as const }),
    pills: css({ display: 'flex', gap: theme.spacing(1), flexWrap: 'wrap' as const, marginTop: theme.spacing(1) }),
    hint: css({ color: theme.colors.text.secondary, padding: theme.spacing(4, 0), textAlign: 'center' as const }),
    dropdown: css({
      position: 'absolute' as const,
      top: '100%',
      left: 0,
      right: 0,
      zIndex: theme.zIndex.dropdown,
      marginTop: theme.spacing(1),
      background: theme.colors.background.primary,
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      boxShadow: theme.shadows.z2,
      maxHeight: '70vh',
      overflowY: 'auto' as const,
    }),
    sectionHeader: css({
      padding: theme.spacing(1, 2),
      color: theme.colors.text.secondary,
      fontWeight: theme.typography.fontWeightMedium,
      fontSize: theme.typography.bodySmall.fontSize,
    }),
    row: css({
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      width: '100%',
      padding: theme.spacing(1, 2),
      background: 'none',
      border: 'none',
      textAlign: 'left' as const,
      cursor: 'pointer',
      '&:hover': { background: theme.colors.action.hover },
    }),
    primary: css({ color: theme.colors.text.primary }),
    secondary: css({ color: theme.colors.text.secondary, fontSize: theme.typography.bodySmall.fontSize }),
    categoryTag: css({ color: theme.colors.text.secondary, fontSize: theme.typography.bodySmall.fontSize }),
  };
}

// Owns the search box, category filter pills, the live autocomplete dropdown
// shown while typing, and the committed table view shown after Enter - same
// interaction model as debeka-k8s-app's Search page:
// - Typing (debounced into the "search" scene variable) keeps a per-category
//   query warm and renders a grouped, clickable suggestion list; clicking a
//   suggestion navigates straight to that object's own Drilldown page.
// - Enter commits the search: the dropdown closes and the same per-category
//   data renders as full tables below, but only for categories with at least
//   one matching row - not as empty "No data" tables.
// - If nothing matches anywhere once committed, a warning banner replaces
//   the tables ("No results found").
function SearchControls({ searchVariable, resultsLayout }: { searchVariable: TextBoxVariable; resultsLayout: SceneFlexLayout }) {
  const styles = useStyles2(getStyles);
  const [searchText, setSearchText] = useState('');
  const [selected, setSelected] = useState<Set<Category>>(new Set());
  const [committed, setCommitted] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  const hasText = searchText.trim() !== '';
  const mountedCategories = useMemo(
    () => (!hasText ? [] : selected.size === 0 ? CATEGORY_ORDER : CATEGORY_ORDER.filter((c) => selected.has(c))),
    [hasText, selected]
  );

  const pipelines = useMemo(() => {
    const built: Partial<Record<Category, ReturnType<typeof buildCategoryPipeline>>> = {};
    for (const category of mountedCategories) {
      built[category] = buildCategoryPipeline(category);
    }
    return built;
  }, [mountedCategories]);

  // Every mounted category's panel is genuinely rendered here (never
  // `isHidden`, which never activates its body at all) so it stays properly
  // reactive to the "search" variable; visually hiding a not-yet-committed
  // (or empty-result) category's table instead uses a plain `height`
  // collapse (see `updateVisibility` below).
  useEffect(() => {
    resultsLayout.setState({
      children: CATEGORY_ORDER.filter((c) => pipelines[c]).map((c) => new SceneFlexItem({ key: c, body: pipelines[c]!.panel })),
    });
  }, [pipelines, resultsLayout]);

  useEffect(() => {
    const handle = setTimeout(() => searchVariable.setValue(searchText), 400);
    return () => clearTimeout(handle);
  }, [searchText, searchVariable]);

  const [prevInvalidationKey, setPrevInvalidationKey] = useState({ searchText, selected });
  if (prevInvalidationKey.searchText !== searchText || prevInvalidationKey.selected !== selected) {
    setPrevInvalidationKey({ searchText, selected });
    setCommitted(false);
    setDismissed(false);
  }

  const [rowsByCategory, setRowsByCategory] = useState<Partial<Record<Category, Row[]>>>({});
  useEffect(() => {
    const apply = (category: Category) => () => {
      setRowsByCategory((prev) => ({ ...prev, [category]: framesToRows(pipelines[category]!.transformedData.state.data?.series) }));
    };
    const subs = Object.keys(pipelines).map((category) => {
      const c = category as Category;
      apply(c)();
      return pipelines[c]!.transformedData.subscribeToState(apply(c));
    });
    return () => subs.forEach((s) => s.unsubscribe());
  }, [pipelines]);

  useEffect(() => {
    for (const category of CATEGORY_ORDER) {
      const item = resultsLayout.state.children.find((child) => child.state.key === category);
      if (item instanceof SceneFlexItem) {
        const visible = committed && (rowsByCategory[category]?.length ?? 0) > 0;
        item.setState({ height: visible ? '400px' : '0px', minHeight: 0 });
      }
    }
  }, [committed, rowsByCategory, resultsLayout]);

  const toggle = (category: Category) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const showDropdown = searchText.trim() !== '' && !committed && !dismissed;
  const totalMatches = committed ? mountedCategories.reduce((sum, c) => sum + (rowsByCategory[c]?.length ?? 0), 0) : -1;

  return (
    <div className={styles.wrapper}>
      <Input
        prefix={<Icon name="search" />}
        placeholder="Search VMware objects... (vCenter, Cluster, Host, VM)"
        value={searchText}
        onChange={(e) => setSearchText(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            setCommitted(true);
          } else if (e.key === 'Escape') {
            setDismissed(true);
          }
        }}
      />
      <div className={styles.pills}>
        {CATEGORY_ORDER.map((category) => (
          <FilterPill key={category} label={CATEGORY_LABELS[category]} selected={selected.has(category)} onClick={() => toggle(category)} />
        ))}
      </div>
      {searchText.trim() === '' && <div className={styles.hint}>Type to search across your VMware objects.</div>}
      {showDropdown && (
        <div className={styles.dropdown}>
          {mountedCategories
            .filter((category) => (rowsByCategory[category]?.length ?? 0) > 0)
            .map((category) => (
              <div key={category}>
                <div className={styles.sectionHeader}>{CATEGORY_DEFS[category].title}</div>
                {rowsByCategory[category]!.map((row, i) => {
                  const def = CATEGORY_DEFS[category];
                  return (
                    <button key={i} className={styles.row} onClick={() => window.location.assign(def.buildSuggestionUrl(row))}>
                      <div>
                        <div className={styles.primary}>{row[def.primaryField]}</div>
                        {def.secondaryField && <div className={styles.secondary}>{row[def.secondaryField]}</div>}
                      </div>
                      <span className={styles.categoryTag}>{def.title}</span>
                    </button>
                  );
                })}
              </div>
            ))}
        </div>
      )}
      {committed && totalMatches === 0 && (
        <Alert severity="warning" title="No results found">
          No results for current search query, try another query or change the time range.
        </Alert>
      )}
    </div>
  );
}

function getSearchScene(searchVariable: TextBoxVariable) {
  const resultsLayout = new SceneFlexLayout({ direction: 'column', children: [] });

  return new EmbeddedScene({
    $behaviors: [attachExploreMenus],
    body: new SceneFlexLayout({
      direction: 'column',
      children: [
        new SceneFlexItem({
          ySizing: 'content',
          body: new SceneReactObject({ reactNode: <SearchControls searchVariable={searchVariable} resultsLayout={resultsLayout} /> }),
        }),
        new SceneFlexItem({ body: resultsLayout }),
      ],
    }),
  });
}

export function getSearchPage() {
  // Constructed once here (not inside getScene, which re-runs on every
  // visit) and shared by reference into both the page's own $variables set
  // (for PromQL interpolation) and the SearchControls React component (for
  // reading/writing its value).
  const searchVariable = createSearchTextVariable();

  return new SceneAppPage({
    title: 'Search',
    subTitle: 'Find vSphere objects, fast',
    url: SEARCH_URL,
    routePath: `${ROUTES.Search}/*`,
    getScene: () => getSearchScene(searchVariable),
    $timeRange: new SceneTimeRange({ from: 'now-1h', to: 'now', timeZone: 'browser' }),
    $variables: new SceneVariableSet({ variables: [createThanosDatasourceVariable(), searchVariable] }),
    controls: [
      new VariableValueControl({ variableName: THANOS_VARIABLE_NAME }),
      new SceneControlsSpacer(),
      new SceneTimePicker({}),
      new SceneRefreshPicker({ refresh: '1m' }),
    ],
    preserveUrlKeys: ['from', 'to', 'timezone', 'refresh', `var-${THANOS_VARIABLE_NAME}`],
  });
}
