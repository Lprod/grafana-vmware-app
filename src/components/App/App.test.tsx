import { getVmwareSceneApp } from '../../scenes/vmwareApp';

// Fully mounting a Scenes app (VizPanel + panel plugin loading + datasource
// resolution) requires bootstrapping most of Grafana's runtime globals
// (config, plugin import utils, datasource service, location service...).
// That's better covered by running the plugin against a real Grafana
// instance, so here we only verify the scene object graph itself is wired up
// correctly: pages, routes and titles, without triggering activation/render.
describe('Components/App', () => {
  test('vmware scene app exposes all top-level pages', () => {
    const sceneApp = getVmwareSceneApp();
    const titles = sceneApp.state.pages.map((p) => p.state.title);

    expect(titles).toEqual(['Search', 'Overview', 'Clusters', 'Hosts', 'Virtual Machines']);
  });

  test('clusters page exposes a cluster drilldown', () => {
    const sceneApp = getVmwareSceneApp();
    const clustersPage = sceneApp.state.pages.find((p) => p.state.title === 'Clusters')!;

    expect(clustersPage.state.url).toBe('/a/debeka-vmware-app/clusters');
    expect(clustersPage.state.drilldowns).toHaveLength(1);
    expect(clustersPage.state.drilldowns?.[0].routePath).toBe('/:cluster/*');
  });

  test('hosts page exposes a host drilldown', () => {
    const sceneApp = getVmwareSceneApp();
    const hostsPage = sceneApp.state.pages.find((p) => p.state.title === 'Hosts')!;

    expect(hostsPage.state.url).toBe('/a/debeka-vmware-app/hosts');
    expect(hostsPage.state.drilldowns).toHaveLength(1);
    expect(hostsPage.state.drilldowns?.[0].routePath).toBe('/:host/*');
  });

  test('vms page exposes a vm drilldown', () => {
    const sceneApp = getVmwareSceneApp();
    const vmsPage = sceneApp.state.pages.find((p) => p.state.title === 'Virtual Machines')!;

    expect(vmsPage.state.url).toBe('/a/debeka-vmware-app/vms');
    expect(vmsPage.state.drilldowns).toHaveLength(1);
    expect(vmsPage.state.drilldowns?.[0].routePath).toBe('/:vm/*');
  });
});
