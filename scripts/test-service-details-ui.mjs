import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('artifacts/service-details');
await fs.mkdir(output, { recursive: true });
const base = process.env.UI_TEST_URL || 'http://127.0.0.1:5173';
const serviceId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const businessId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const baseline = {
  id: serviceId, slug: 'qa-service', name: 'Business Online Billing and Payment',
  short_description: 'View business assessments, review outstanding municipal charges, and process eligible business payments online.',
  kind: 'BUSINESS', online_available: true, payment_required: true,
  settings: { workflow_type: 'ASSESSMENT_PAYMENT' }, department_name: 'Municipal Assessor’s Office',
  processing_time: 'Existing payable assessments may be processed immediately. Requests requiring assessment or verification are subject to review by the appropriate municipal office.',
  eligibility: 'Registered business owners and authorized representatives with an existing business account or assessment.',
  requirements: [], fees: [{ code: 'fee', description: 'Processing fee', amount: '250.00' }],
};
const business = { id: businessId, business_name: 'Pongcol Trading', business_reference: '000123', status: 'ACTIVE', address: {} };
const browser = await chromium.launch({ headless: true });
try {
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 768, height: 1024 }, { width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport }), page = await context.newPage();
    let service = { ...baseline }, businesses = [business], applications = [], serviceMode = 'ok', businessMode = 'ok', applicationMode = 'ok', startMode = 'ok', submitted = null;
    let releaseService, releaseBusinesses;
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/**', async route => {
      const request = route.request(), url = new URL(request.url()), endpoint = url.pathname;
      let body = { items: [] }, status = 200;
      if (endpoint === '/api/auth/me') body = { user: { id: 'qa-resident', role: 'resident', name: 'Test Resident', email: 'resident@example.invalid', setupRequired: false } };
      else if (endpoint === '/api/citizen/dashboard') body = { profile: { full_name: 'Test Resident' }, notifications: [], appointments: [], applications: [], documents: [], payments: [], counts: {} };
      else if (endpoint === '/api/users/me/preferences') body = { preferences: {} };
      else if (endpoint === '/api/public/config') body = { 'general.name': 'Municipality of Getafe' };
      else if (endpoint === '/api/services/qa-service') {
        if (serviceMode === 'loading') await new Promise(resolve => { releaseService = resolve; });
        if (serviceMode === 'error') { status = 503; body = { error: 'API_PROXY_BACKEND_UNAVAILABLE ECONNREFUSED Database connection error' }; } else body = service;
      } else if (endpoint === '/api/services') body = { items: [service] };
      else if (endpoint === '/api/businesses') {
        if (businessMode === 'loading') await new Promise(resolve => { releaseBusinesses = resolve; });
        if (businessMode === 'error') { status = 503; body = { error: '500 Internal Server Error stacktrace' }; } else body = { items: businesses };
      } else if (endpoint === '/api/requests' && request.method() === 'POST') {
        submitted = request.postDataJSON();
        if (startMode === 'error') { status = 503; body = { error: 'ECONNREFUSED' }; }
        else body = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' };
      } else if (endpoint === '/api/requests') {
        if (applicationMode === 'error') { status = 503; body = { error: 'Database connection error' }; }
        else body = { items: applications.filter(item => !url.searchParams.get('business_id') || item.business_id === url.searchParams.get('business_id')) };
      } else if (endpoint.startsWith('/api/requests/')) body = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', status: 'DRAFT', version: 1, request_number: 'GET-QA-0001', service: { ...service, definition: { declaration: 'I confirm my information.' } }, definition: { declaration: 'I confirm my information.' }, fields: [], values: {}, documents: [], requirements: [], orders: [], history: [], notes: [], applicant_snapshot: {}, draft_step: 0 };
      await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    });
    let caseNumber = 0;
    const open = async () => { await page.goto(`${base}/app/services/qa-service?case=${++caseNumber}`); };
    const workspace = page.locator('.es-service-detail');
    const selector = page.getByRole('combobox', { name: 'Registered business' });
    const primary = page.getByRole('button', { name: 'Start application', exact: true });
    await open();
    await page.getByRole('heading', { name: baseline.name, exact: true }).waitFor();
    assert.equal(await page.locator('.portal-page-title').count(), 0);
    assert.equal(await workspace.getByRole('link', { name: 'Service catalog', exact: true }).count(), 0);
    assert.equal(await workspace.getByText('Municipality of Getafe', { exact: true }).count(), 0);
    assert.equal(await workspace.evaluate(node => node.firstElementChild.tagName), 'HEADER');
    assert.equal(await primary.isDisabled(), true);
    await selector.selectOption(businessId);
    await page.getByText('Business ID: 000123', { exact: true }).waitFor();
    assert.equal(await primary.isEnabled(), true);
    assert.equal(await workspace.getByText('No additional documents are currently required for this service.', { exact: true }).count(), 1);
    assert.equal(await workspace.getByText('₱250.00', { exact: true }).count(), 1);
    const infoBox = await page.locator('.sd-information').boundingBox(), asideBox = await page.locator('.es-service-aside').boundingBox();
    if (viewport.width > 800) { assert.ok(Math.abs(infoBox.y - asideBox.y) < 2); assert.equal(await page.locator('.es-service-aside').evaluate(node => getComputedStyle(node).position), 'sticky'); }
    else { assert.ok(asideBox.y < infoBox.y); assert.equal(await page.locator('.es-service-aside').evaluate(node => getComputedStyle(node).position), 'static'); }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(output, `service-${viewport.width}.png`), fullPage: true });
    await selector.focus(); await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('link', { name: 'Manage business information' }).evaluate(node => node === document.activeElement), true);
    await page.keyboard.press('Tab');
    assert.equal(await primary.evaluate(node => node === document.activeElement), true);
    startMode = 'error'; await primary.click();
    await workspace.getByRole('alert').waitFor();
    assert.ok(!(await workspace.innerText()).includes('ECONNREFUSED'));
    startMode = 'ok'; await primary.click();
    await page.waitForURL('**/app/e-requests/*');
    assert.equal(submitted.business_id, businessId);
    businesses = []; await open();
    await page.getByText('No registered businesses are linked to your account.', { exact: true }).first().waitFor();
    assert.equal(await primary.isDisabled(), true);
    assert.equal(await selector.isDisabled(), true);
    assert.equal(await page.getByRole('link', { name: 'Manage business information' }).count(), 1);
    businesses = [business, { ...business, id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', business_name: 'New Resident Enterprise', status: 'UNVERIFIED', business_reference: 'PROFILE-dddddddd-dddd-4ddd-8ddd-dddddddddddd' }];
    service = { ...baseline, name: 'Business Online Billing and Payment for Residents and Authorized Representatives with Multiple Municipal Assessments', short_description: baseline.short_description.repeat(4),
      requirements: [{ id: 'one', label: 'Business permit', required: true, help_text: 'Upload the current permit.' }, { id: 'two', label: 'Authorization letter', required: false }],
      fees: [...baseline.fees, { code: 'second', description: 'Additional configured service charge', amount: '1250.00' }],
      instructions: 'Confirm your business details before submitting.', processing_information: 'The office reviews all submitted information.', service_steps: ['Select a business', 'Submit the application'], important_reminders: 'Keep your receipt for your records.', contact: { email: 'office@example.invalid', phone: '09123456789' } };
    await open(); await selector.selectOption('dddddddd-dddd-4ddd-8ddd-dddddddddddd');
    await page.getByText('For verification', { exact: true }).waitFor();
    assert.ok(!(await workspace.innerText()).includes('PROFILE-'));
    assert.ok(!(await workspace.innerText()).includes('dddddddd-dddd-4ddd'));
    assert.equal(await page.getByRole('heading', { name: 'Important reminders' }).count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
    await page.screenshot({ path: path.join(output, `long-content-${viewport.width}.png`), fullPage: true });
    service = { ...baseline, fees: [], payment_required: false }; await open();
    await page.getByText('No fees are currently listed for this service.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('heading', { name: 'Instructions', exact: true }).count(), 0);
    serviceMode = 'loading'; await open();
    await page.getByText('Loading service information…', { exact: true }).waitFor();
    releaseService(); serviceMode = 'ok'; await selector.waitFor();
    businessMode = 'loading'; await open();
    await page.getByText('Loading registered businesses…', { exact: true }).waitFor();
    assert.equal(await primary.isDisabled(), true);
    releaseBusinesses(); businessMode = 'ok'; await selector.waitFor();
    businessMode = 'error'; await open();
    await page.getByText('We couldn’t load your businesses.', { exact: true }).waitFor();
    assert.equal(await primary.isDisabled(), true);
    assert.ok(!(await workspace.innerText()).includes('stacktrace'));
    businessMode = 'ok'; await workspace.getByRole('button', { name: 'Try again', exact: true }).click();
    await selector.selectOption(businessId);
    serviceMode = 'error'; await open();
    await page.getByRole('heading', { name: 'Service unavailable' }).waitFor();
    assert.ok(!(await workspace.innerText()).includes('API_PROXY'));
    serviceMode = 'ok'; await workspace.getByRole('button', { name: 'Try again', exact: true }).click();
    await selector.waitFor();
    applicationMode = 'error'; await open(); await selector.selectOption(businessId);
    await page.getByText('We couldn’t check your existing applications. Check My Requests before starting another.', { exact: true }).waitFor();
    applicationMode = 'ok';
    for (const status of ['DRAFT', 'AWAITING_PAYMENT', 'FOR_ASSESSMENT']) {
      applications = [{ id: 'existing', service_id: serviceId, business_id: businessId, status, payment_pending: false }];
      await open(); await selector.selectOption(businessId);
      await page.getByRole('link', { name: status === 'DRAFT' ? 'Resume application' : 'View existing application', exact: true }).waitFor();
      if (status === 'AWAITING_PAYMENT') await page.getByText('Payment required. Review the assessment in your request.', { exact: true }).waitFor();
      if (status === 'FOR_ASSESSMENT') await page.getByText('Assessment required. The office is reviewing applicable charges.', { exact: true }).waitFor();
    }
    applications = [{ ...applications[0], payment_pending: true }]; await open(); await selector.selectOption(businessId);
    await page.getByText('Payment pending. Your payment is awaiting confirmation.', { exact: true }).waitFor();
    await page.screenshot({ path: path.join(output, `existing-application-${viewport.width}.png`), fullPage: true });
    applications = []; service = { ...baseline, online_available: false }; await open();
    await selector.selectOption(businessId);
    assert.equal(await primary.isDisabled(), true);
    await page.getByText('Online applications are currently unavailable for this service.', { exact: true }).waitFor();
    service = { ...baseline, kind: 'APPLICATION', settings: { workflow_type: 'APPLICATION' } }; await open();
    await primary.waitFor();
    assert.equal(await selector.count(), 0);
    assert.equal(await primary.isEnabled(), true);
    assert.deepEqual(errors, []);
    console.log(`${viewport.width}px: title-first layout, content variations, business selection, loading, failures, existing requests, keyboard and start flow passed.`);
    await context.close();
  }
} finally { await browser.close(); }
