import { test, expect } from './fixtures';
import { ROUTES } from '../src/constants';

test.describe('navigating app', () => {
  test('search page should render successfully', async ({ gotoPage, page }) => {
    await gotoPage(`/${ROUTES.Search}`);
    await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
  });

  test('overview page should render successfully', async ({ gotoPage, page }) => {
    await gotoPage(`/${ROUTES.Overview}`);
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });

  test('clusters page should render successfully', async ({ gotoPage, page }) => {
    await gotoPage(`/${ROUTES.Clusters}`);
    await expect(page.getByRole('heading', { name: 'Clusters' })).toBeVisible();
  });

  test('hosts page should render successfully', async ({ gotoPage, page }) => {
    await gotoPage(`/${ROUTES.Hosts}`);
    await expect(page.getByRole('heading', { name: 'Hosts' })).toBeVisible();
  });

  test('vms page should render successfully', async ({ gotoPage, page }) => {
    await gotoPage(`/${ROUTES.VMs}`);
    await expect(page.getByRole('heading', { name: 'Virtual Machines' })).toBeVisible();
  });
});
