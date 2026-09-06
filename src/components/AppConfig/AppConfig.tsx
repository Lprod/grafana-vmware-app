import React, { useState } from 'react';
import { lastValueFrom } from 'rxjs';
import { AppPluginMeta, DataSourceInstanceSettings, PluginConfigPageProps } from '@grafana/data';
import { DataSourcePicker, getBackendSrv } from '@grafana/runtime';
import { Alert, Button, Field, FieldSet, Stack } from '@grafana/ui';
import type { AppJsonData } from '../../utils/appJsonData';
import { testIds } from '../testIds';

export interface AppConfigProps extends PluginConfigPageProps<AppPluginMeta<AppJsonData>> {}

const AppConfig = ({ plugin }: AppConfigProps) => {
  const initial: AppJsonData = plugin.meta.jsonData ?? {};
  const [state, setState] = useState<AppJsonData>(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = state.prometheusUid !== initial.prometheusUid;

  const onPick = (key: keyof AppJsonData) => (ds: DataSourceInstanceSettings) =>
    setState((s) => ({ ...s, [key]: ds.uid }));

  const onSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await lastValueFrom(
        getBackendSrv().fetch({
          url: `/api/plugins/${plugin.meta.id}/settings`,
          method: 'POST',
          data: {
            enabled: plugin.meta.enabled,
            pinned: plugin.meta.pinned,
            jsonData: state,
          },
        })
      );
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  return (
    <Stack direction="column" gap={2}>
      <Alert title="Datasource defaults" severity="info">
        Pick the default datasource used by this app for vSphere metrics (Telegraf vSphere input, exposed via
        Prometheus/Thanos). Users can still override per session via the dropdown at the top of each page or via{' '}
        <code>var-datasource=...</code> URL parameters.
      </Alert>

      <FieldSet label="Defaults">
        <Field label="Metrics (Prometheus / Thanos)" description="Used for all vSphere PromQL queries.">
          <div data-testid={testIds.appConfig.prometheusPicker}>
            <DataSourcePicker
              pluginId="prometheus"
              current={state.prometheusUid ?? null}
              noDefault
              onChange={onPick('prometheusUid')}
            />
          </div>
        </Field>
      </FieldSet>

      {error && (
        <Alert title="Failed to save" severity="error">
          {error}
        </Alert>
      )}

      <Stack direction="row" gap={1}>
        <Button
          onClick={onSave}
          disabled={!dirty || saving}
          icon={saving ? 'fa fa-spinner' : undefined}
          data-testid={testIds.appConfig.submit}
        >
          {saving ? 'Saving…' : 'Save defaults'}
        </Button>
      </Stack>
    </Stack>
  );
};

export default AppConfig;
