import React from 'react';
import { css } from '@emotion/css';
import { DataFrame, FieldType, GrafanaTheme2 } from '@grafana/data';
import { SceneComponentProps, SceneDataProvider, SceneObjectBase, SceneObjectState, sceneGraph } from '@grafana/scenes';
import { useStyles2 } from '@grafana/ui';

export interface InfoCardRow {
  label: string;
  /** Table-format queries: looks up this exact label/field name across every frame. */
  fieldName?: string;
  /** Time-series/instant queries: reads the first value field of the query with this refId. */
  refId?: string;
  /** For rows whose value is already known (route params) or combines fields. */
  render?: (frames: DataFrame[]) => string | undefined;
  href?: string | ((frames: DataFrame[]) => string | undefined);
}

// For table-format queries, where every Prometheus label becomes its own
// field named after that label (e.g. `clustername`, `vcenter`).
export function findFieldAcrossFrames(frames: DataFrame[], fieldName: string): string | undefined {
  for (const frame of frames) {
    const field = frame.fields.find((f) => f.name === fieldName);
    if (field && field.values.length > 0 && field.values[0] != null && field.values[0] !== '') {
      return String(field.values[0]);
    }
  }
  return undefined;
}

// For time-series/instant queries (this app's usual `promRunner`/`query`
// pattern, one named value per refId) - each query keeps its own frame
// (`frame.refId`), so a scalar value is found by refId rather than by field
// name (the value field's raw name is just "Value" for every one of them).
// Matched by `FieldType.number` specifically, not merely "not Time" - a
// `by(label)` aggregation's frame also carries a string label field ahead of
// its own Value field, which "not Time" would otherwise match first.
export function findValueByRefId(frames: DataFrame[], refId: string): string | undefined {
  const frame = frames.find((f) => f.refId === refId);
  const field = frame?.fields.find((f) => f.type === FieldType.number);
  const value = field?.values[0];
  return value != null && !Number.isNaN(value) ? String(value) : undefined;
}

export interface InfoCardState extends SceneObjectState {
  title: string;
  rows: InfoCardRow[];
  $data: SceneDataProvider;
}

// A metadata card: label/value rows read out of one or more data frames,
// each row either a plain field lookup or a `render` callback for values
// that combine fields or are already known from the page's own route
// params. Mirrors debeka-k8s-app's own InfoCard - searches *every* frame in
// `$data`, not just the first, so one card can mix rows sourced from
// different queries without needing them pre-joined into one frame.
export class InfoCard extends SceneObjectBase<InfoCardState> {
  static Component = InfoCardRenderer;
}

function InfoCardRenderer({ model }: SceneComponentProps<InfoCard>) {
  const styles = useStyles2(getStyles);
  const { title, rows } = model.useState();
  const { data } = sceneGraph.getData(model).useState();
  const frames = data?.series ?? [];

  return (
    <div className={styles.card}>
      <div className={styles.header}>{title}</div>
      <div className={styles.rows}>
        {rows.map((row) => {
          const value = row.render
            ? row.render(frames)
            : row.refId
              ? findValueByRefId(frames, row.refId)
              : findFieldAcrossFrames(frames, row.fieldName!);
          const href = typeof row.href === 'function' ? row.href(frames) : row.href;
          return (
            <div className={styles.row} key={row.label}>
              <span className={styles.label}>{row.label}</span>
              {href && value ? (
                <a className={styles.link} href={href}>
                  {value}
                </a>
              ) : (
                <span className={styles.value}>{value ?? '–'}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function getStyles(theme: GrafanaTheme2) {
  return {
    card: css({
      background: theme.colors.background.secondary,
      border: `1px solid ${theme.colors.border.weak}`,
      borderRadius: theme.shape.radius.default,
      padding: theme.spacing(1.5, 2),
      height: '100%',
      display: 'flex',
      flexDirection: 'column' as const,
    }),
    header: css({
      fontSize: theme.typography.h5.fontSize,
      fontWeight: theme.typography.fontWeightMedium,
      marginBottom: theme.spacing(1),
      color: theme.colors.text.primary,
    }),
    rows: css({ display: 'flex', flexDirection: 'column' as const }),
    row: css({
      display: 'flex',
      justifyContent: 'space-between',
      gap: theme.spacing(2),
      padding: theme.spacing(0.75, 0),
      borderBottom: `1px solid ${theme.colors.border.weak}`,
      '&:last-child': { borderBottom: 'none' },
    }),
    label: css({ color: theme.colors.text.secondary }),
    value: css({ color: theme.colors.text.primary, fontWeight: theme.typography.fontWeightMedium }),
    link: css({ fontWeight: theme.typography.fontWeightMedium }),
  };
}
