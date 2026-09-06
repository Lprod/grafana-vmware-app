import { DEFAULT_PROMETHEUS_UID } from '../constants';

export type AppJsonData = {
  prometheusUid?: string;
};

export type ResolvedDatasourceDefaults = {
  prometheusUid: string;
};

let currentJsonData: AppJsonData = {};

export function setAppJsonData(jsonData: AppJsonData | undefined) {
  currentJsonData = jsonData ?? {};
}

export function getDatasourceDefaults(): ResolvedDatasourceDefaults {
  return {
    prometheusUid: currentJsonData.prometheusUid || DEFAULT_PROMETHEUS_UID,
  };
}
