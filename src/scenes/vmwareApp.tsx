import { SceneApp } from '@grafana/scenes';
import { getSearchPage } from '../pages/Search/searchPage';
import { getOverviewPage } from './overviewApp';
import { getVcentersPage } from './vcentersApp';
import { getClustersPage } from './clustersApp';
import { getHostsPage } from './hostsApp';
import { getVmsPage } from './vmsApp';

export function getVmwareSceneApp() {
  return new SceneApp({
    pages: [getSearchPage(), getOverviewPage(), getVcentersPage(), getClustersPage(), getHostsPage(), getVmsPage()],
    urlSyncOptions: { updateUrlOnInit: true, createBrowserHistorySteps: true },
  });
}
