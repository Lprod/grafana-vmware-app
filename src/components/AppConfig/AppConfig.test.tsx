import React from 'react';
import { render, screen } from '@testing-library/react';
import { DataSourceInstanceSettings, PluginType } from '@grafana/data';
import { DataSourceSrv, setDataSourceSrv } from '@grafana/runtime';
import AppConfig, { AppConfigProps } from './AppConfig';
import { testIds } from '../testIds';

describe('Components/AppConfig', () => {
  let props: AppConfigProps;

  beforeEach(() => {
    jest.resetAllMocks();

    setDataSourceSrv({
      get: () => Promise.reject(new Error('not mocked')),
      getList: () => [] as DataSourceInstanceSettings[],
      getInstanceSettings: () => undefined,
    } as unknown as DataSourceSrv);

    props = {
      plugin: {
        meta: {
          id: 'debeka-vmware-app',
          name: 'VMware',
          type: PluginType.app,
          enabled: true,
          jsonData: {},
        },
      },
      query: {},
    } as unknown as AppConfigProps;
  });

  test('renders the datasource default picker for Prometheus/Thanos', () => {
    render(<AppConfig plugin={props.plugin} query={props.query} />);

    expect(screen.queryByTestId(testIds.appConfig.prometheusPicker)).toBeInTheDocument();
    expect(screen.queryByTestId(testIds.appConfig.submit)).toBeInTheDocument();
  });
});
