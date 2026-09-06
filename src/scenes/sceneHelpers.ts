import { SceneDataQuery, SceneQueryRunner } from '@grafana/scenes';
import { THANOS_VARIABLE_NAME } from '../variables/vsphereVariables';

export type QuerySpec = SceneDataQuery & { expr: string };

// A SceneQueryRunner against the app's Prometheus/Thanos datasource variable,
// running one or more PromQL targets.
export function promRunner(queries: QuerySpec[], opts: { instant?: boolean; format?: 'time_series' | 'table' } = {}) {
  return new SceneQueryRunner({
    datasource: { uid: `\${${THANOS_VARIABLE_NAME}}` },
    queries: queries.map((q) => ({
      instant: opts.instant,
      format: opts.format ?? 'time_series',
      ...q,
    })),
  });
}

export function query(refId: string, expr: string, legendFormat?: string): QuerySpec {
  return { refId, expr, legendFormat };
}
