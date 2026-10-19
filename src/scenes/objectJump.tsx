import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { css } from '@emotion/css';
import { GrafanaTheme2, LoadingState } from '@grafana/data';
import { locationService } from '@grafana/runtime';
import { SceneDataTransformer, SceneQueryRunner, SceneTimeRange, SceneVariableSet } from '@grafana/scenes';
import { Icon, Input, Spinner, useStyles2 } from '@grafana/ui';
import { buildSearchTarget } from '../queries/searchQueries';
import {
  CATEGORY_DEFS,
  CATEGORY_ORDER,
  Category,
  Row,
  SEARCH_URL,
  framesToRows,
  mergeAndOrganize,
} from '../pages/Search/searchPage';
import { SEARCH_VARIABLE_NAME, THANOS_VARIABLE_NAME, createSearchTextVariable } from '../variables/vsphereVariables';
import { getDatasourceDefaults } from '../utils/appJsonData';

// Jump-to-object overlay: press "/" anywhere in the app, type part of a
// name, Enter opens that object's own page. Mirrors debeka-k8s-app's own
// objectJump.tsx - the Search page's own per-category queries and
// suggestion rows, as a dialog over whatever page is open, instead of
// Navigation -> Search -> type again. The Search page itself is untouched
// (only its helpers are exported); the shortcut is ignored there, since
// that page *is* the search.
//
// Mounted once in App.tsx, outside the scene tree, so it builds its own
// small query pipelines: per category a SceneQueryRunner carrying its own
// time range and "search" TextBoxVariable (the same `${search:regex}`
// escaping the Search page itself uses), activated by hand and rebuilt for
// every debounced term - SceneQueryRunner only needs `.activate()` to run,
// it doesn't need to be mounted in a real rendered scene.

export const JUMP_SHORTCUT = '/';
const DEBOUNCE_MS = 250;

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) ||
    target.closest('[role="textbox"]') !== null
  );
}

export function isJumpShortcut(e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'target'>): boolean {
  return e.key === JUMP_SHORTCUT && !e.ctrlKey && !e.metaKey && !e.altKey && !isEditableTarget(e.target);
}

// The page's own Thanos datasource choice, if it has one in the URL. Scenes
// may suffix the key ("var-datasource-2"), so match on the prefix.
function datasourceFromSearch(search: string): string | undefined {
  const params = new URLSearchParams(search);
  const pattern = new RegExp(`^var-${THANOS_VARIABLE_NAME}(-\\d+)?$`);
  for (const [key, value] of params) {
    if (pattern.test(key) && value) {
      return value;
    }
  }
  return undefined;
}

// Carry the current time range into the destination, like the app's own
// `${__url.params}` links do for from/to.
function timeParams(search: string): string {
  const params = new URLSearchParams(search);
  const kept = new URLSearchParams();
  for (const key of ['from', 'to', 'timezone']) {
    const value = params.get(key);
    if (value) {
      kept.set(key, value);
    }
  }
  const text = kept.toString();
  return text ? `?${text}` : '';
}

interface Pipeline {
  category: Category;
  data: SceneDataTransformer;
}

function buildPipeline(category: Category, term: string, datasourceUid: string, from: string, to: string): Pipeline {
  const searchVariable = createSearchTextVariable();
  searchVariable.setState({ value: term });
  const runner = new SceneQueryRunner({
    datasource: { uid: datasourceUid },
    queries: [buildSearchTarget(category, `\${${SEARCH_VARIABLE_NAME}:regex}`)],
    $timeRange: new SceneTimeRange({ from, to, timeZone: 'browser' }),
    $variables: new SceneVariableSet({ variables: [searchVariable] }),
  });
  const data = new SceneDataTransformer({
    $data: runner,
    transformations: mergeAndOrganize(CATEGORY_DEFS[category].indexByName),
  });
  return { category, data };
}

interface Item {
  key: string;
  url: string;
}

function JumpDialog({ onClose }: { onClose: () => void }) {
  const styles = useStyles2(getStyles);
  const inputRef = useRef<HTMLInputElement>(null);
  // Captured once when the dialog opens - the page behind it doesn't change
  // while it's open.
  const [context] = useState(() => {
    const search = locationService.getLocation().search;
    const params = new URLSearchParams(search);
    return {
      datasourceUid: datasourceFromSearch(search) ?? getDatasourceDefaults().prometheusUid,
      from: params.get('from') ?? 'now-1h',
      to: params.get('to') ?? 'now',
      carry: timeParams(search),
    };
  });
  const [text, setText] = useState('');
  const [term, setTerm] = useState('');
  // Rows plus the term they belong to and how many categories have
  // answered, so "still loading" is derived instead of stored. Rows of the
  // previous term stay on screen until the new ones land (no flicker to
  // empty).
  const [results, setResults] = useState<{
    term: string;
    rows: Partial<Record<Category, Row[]>>;
    answered: Category[];
  }>({ term: '', rows: {}, answered: [] });
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setTerm(text.trim()), DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [text]);

  useEffect(() => {
    if (!term) {
      return;
    }
    const pipelines = CATEGORY_ORDER.map((c) =>
      buildPipeline(c, term, context.datasourceUid, context.from, context.to)
    );
    const update = (pipeline: Pipeline) => {
      const panelData = pipeline.data.state.data;
      if (!panelData || panelData.state === LoadingState.Loading || panelData.state === LoadingState.NotStarted) {
        return;
      }
      const rows = framesToRows(panelData.series);
      setResults((prev) => {
        const answered = prev.term === term ? prev.answered : [];
        return {
          term,
          rows: { ...(prev.term === term ? prev.rows : {}), [pipeline.category]: rows },
          answered: answered.includes(pipeline.category) ? answered : [...answered, pipeline.category],
        };
      });
    };
    const subscriptions = pipelines.map((p) => p.data.subscribeToState(() => update(p)));
    const deactivators = pipelines.map((p) => p.data.activate());
    return () => {
      subscriptions.forEach((s) => s.unsubscribe());
      deactivators.forEach((deactivate) => deactivate());
    };
  }, [term, context]);

  const rowsByCategory = results.rows;
  const loading = term !== '' && (results.term !== term || results.answered.length < CATEGORY_ORDER.length);

  // New term -> start selection from the top again.
  const [prevTerm, setPrevTerm] = useState(term);
  if (prevTerm !== term) {
    setPrevTerm(term);
    setActiveIndex(0);
  }

  const items: Item[] = CATEGORY_ORDER.flatMap((category) =>
    (rowsByCategory[category] ?? []).map((row, i) => ({
      key: `${category}-${i}`,
      url: CATEGORY_DEFS[category].buildSuggestionUrl(row),
    }))
  );
  const active = Math.min(activeIndex, items.length - 1);

  useEffect(() => {
    if (active >= 0) {
      document.getElementById(`object-jump-item-${active}`)?.scrollIntoView({ block: 'nearest' });
    }
  }, [active]);

  const open = (url: string) => {
    onClose();
    locationService.push(`${url}${context.carry}`);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(Math.min(active + 1, items.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(Math.max(active - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (active >= 0 && items[active]) {
        open(items[active].url);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose();
    }
  };

  const itemProps = (index: number, url: string) => ({
    id: `object-jump-item-${index}`,
    role: 'option' as const,
    'aria-selected': index === active,
    className: `${styles.row} ${index === active ? styles.rowActive : ''}`,
    // mousemove, not mouseenter: rows appearing under a resting pointer must
    // not steal the keyboard selection.
    onMouseMove: () => index !== active && setActiveIndex(index),
    // mousedown, not click: keeps focus in the input until navigation.
    onMouseDown: (e: React.MouseEvent) => {
      e.preventDefault();
      open(url);
    },
  });

  let index = -1;
  return (
    <div className={styles.backdrop} onMouseDown={onClose} data-testid="object-jump">
      <div
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-label="Jump to object"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <Input
          ref={inputRef}
          prefix={<Icon name="search" />}
          suffix={loading ? <Spinner inline /> : undefined}
          placeholder="Jump to a vCenter, cluster, host or VM…"
          value={text}
          onChange={(e) => setText(e.currentTarget.value)}
          role="combobox"
          aria-expanded={items.length > 0}
          aria-controls="object-jump-list"
          aria-activedescendant={active >= 0 ? `object-jump-item-${active}` : undefined}
        />
        <div className={styles.list} id="object-jump-list" role="listbox">
          {term === '' && <div className={styles.empty}>Type part of a name to jump straight to its page.</div>}
          {term !== '' &&
            CATEGORY_ORDER.filter((c) => (rowsByCategory[c]?.length ?? 0) > 0).map((category) => {
              const def = CATEGORY_DEFS[category];
              return (
                <div key={category} role="group" aria-label={def.title}>
                  <div className={styles.sectionHeader}>{def.title}</div>
                  {rowsByCategory[category]!.map((row, i) => {
                    index += 1;
                    return (
                      <button key={`${category}-${i}`} {...itemProps(index, def.buildSuggestionUrl(row))}>
                        <div>
                          <div className={styles.primary}>{row[def.primaryField]}</div>
                          {def.secondaryField && <div className={styles.secondary}>{row[def.secondaryField]}</div>}
                        </div>
                        <span className={styles.secondary}>{def.title}</span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          {term !== '' && !loading && items.length === 0 && (
            <div className={styles.empty}>No objects match “{term}” in the selected time range.</div>
          )}
        </div>
        <div className={styles.keyHint}>
          <kbd>↑</kbd> <kbd>↓</kbd> select · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close
          <span className={styles.hintRight}>
            <kbd>{JUMP_SHORTCUT}</kbd> opens this anywhere
          </span>
        </div>
      </div>
    </div>
  );
}

// Mounted once in App.tsx. Owns only the shortcut and the open/closed state.
export function ObjectJumpOverlay() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (open || !isJumpShortcut(e) || locationService.getLocation().pathname.startsWith(SEARCH_URL)) {
        return;
      }
      e.preventDefault();
      setOpen(true);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  return open ? createPortal(<JumpDialog onClose={() => setOpen(false)} />, document.body) : null;
}

function getStyles(theme: GrafanaTheme2) {
  return {
    backdrop: css({
      position: 'fixed' as const,
      inset: 0,
      zIndex: theme.zIndex.modal,
      background: theme.components.overlay.background,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      paddingTop: '12vh',
    }),
    dialog: css({
      width: 'min(680px, calc(100vw - 32px))',
      background: theme.colors.background.primary,
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      boxShadow: theme.shadows.z3,
      padding: theme.spacing(1.5),
      display: 'flex',
      flexDirection: 'column' as const,
      gap: theme.spacing(1),
    }),
    list: css({ maxHeight: '55vh', overflowY: 'auto' as const }),
    sectionHeader: css({
      padding: theme.spacing(1, 2, 0.5),
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
      borderRadius: theme.shape.radius.default,
      textAlign: 'left' as const,
      cursor: 'pointer',
    }),
    rowActive: css({ background: theme.colors.action.hover }),
    primary: css({ color: theme.colors.text.primary }),
    secondary: css({ color: theme.colors.text.secondary, fontSize: theme.typography.bodySmall.fontSize }),
    empty: css({ padding: theme.spacing(3, 2), color: theme.colors.text.secondary, textAlign: 'center' as const }),
    keyHint: css({
      display: 'flex',
      gap: theme.spacing(0.5),
      alignItems: 'center',
      paddingTop: theme.spacing(1),
      borderTop: `1px solid ${theme.colors.border.weak}`,
      color: theme.colors.text.secondary,
      fontSize: theme.typography.bodySmall.fontSize,
      '& kbd': {
        fontFamily: theme.typography.fontFamilyMonospace,
        fontSize: theme.typography.bodySmall.fontSize,
        padding: theme.spacing(0, 0.5),
        border: `1px solid ${theme.colors.border.medium}`,
        borderRadius: theme.shape.radius.default,
        background: theme.colors.background.secondary,
      },
    }),
    hintRight: css({ marginLeft: 'auto', display: 'flex', gap: theme.spacing(0.5), alignItems: 'center' }),
  };
}
