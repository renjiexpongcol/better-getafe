import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { chromium } from 'playwright';
const employee = { id:'15e7cd55-1289-4589-81f6-95af3b4aac2a',name:'Renjie',email:'rp34374@outlook.com',eid:'000002',department:'Information Technology',position:'CMS Administrator',role:'staff',groups:[{ id:'support',name:'Staff_Support' }] };
const admin = { id:'administrator',name:'CMS Administrator',email:'admin@example.com',eid:'000001',role:'super_admin',permissions:['users.view','users.manage','groups.manage','permissions.manage','policies.manage','audit.view','admin.dashboard.view'] };
const profile = { ...employee,user_id:employee.id,employment_status:'Active',account_status:'Active',created_at:'2026-10-02T00:00:00Z',updated_at:'2026-10-02T00:00:00Z',account_created_at:'2026-10-02T00:00:00Z',account_updated_at:'2026-10-02T00:00:00Z',creator_name:admin.name,creator_eid:admin.eid,mfa_status:'Not Enrolled',password_status:'Password Setup Required',last_login_at:null };
const browser = await chromium.launch({ headless:true,...(process.env.PLAYWRIGHT_CHANNEL ? { channel:process.env.PLAYWRIGHT_CHANNEL } : {}) });
await fs.mkdir('artifacts/employee-profiles',{ recursive:true });
try {
  for (const width of [1440,390]) {
    const context=await browser.newContext({ viewport:{ width,height:1000 } });
    const page=await context.newPage(); const errors=[],writes=[];
    page.on('pageerror',error => errors.push(error.message));
    await page.route('**/api/**',route => {
      const request=route.request(),path=new URL(request.url()).pathname;
      let body=[];
      if (path === '/api/auth/me') body={ user:admin };
      else if (['/api/news', '/api/admin/news'].includes(path)) body={ items:[] };
      else if (path === '/api/public/config') body={ 'general.name':'Getafe' };
      else if (path === '/api/admin/access') body={ users:[employee],groups:[{ id:'support',name:'Staff_Support',enabled:true }],permissions:[],policies:[],activity:[] };
      else if (path === '/api/admin/users') body=request.method() === 'POST' ? { saved:true,id:'new-employee',eid:'000003' } : { users:[admin,employee] };
      else if (path.endsWith('/profile')) body=request.method() === 'PATCH' ? { saved:true } : profile;
      else if (path.includes('preferences')) body={ preferences:{} };
      if (['POST','PATCH'].includes(request.method())) writes.push({ path,body:request.postDataJSON() });
      return route.fulfill({ json:body });
    });
    await page.goto(`${process.env.UI_TEST_URL || 'http://127.0.0.1:5173'}/admin/users`);
    try { await page.getByText('rp34374@outlook.com · EID 000002',{ exact:true }).waitFor({ timeout:10000 }); } catch (error) { console.log('UI errors:',errors,'URL:',page.url(),await page.locator('body').innerText()); throw error; }
    for (const query of ['000002','Information Technology','CMS Administrator','rp34374','Renjie']) {
      await page.locator('.access-toolbar input').fill(query);
      assert.equal(await page.getByRole('button',{ name:'View access' }).count(),1);
    }
    await page.getByRole('button',{ name:'View access' }).click();
    await page.getByRole('heading',{ name:'Employee profile' }).waitFor();
    const dialog=page.getByRole('dialog');
    assert.ok((await dialog.innerText()).includes('Password Setup Required'));
    assert.ok((await dialog.innerText()).includes('Not Enrolled'));
    assert.ok((await dialog.innerText()).includes('Never'));
    assert.ok(!(await dialog.innerText()).includes(employee.id));
    await dialog.getByLabel('Phone number').fill('09123456789');
    await dialog.getByRole('button',{ name:'Save personnel details' }).click();
    await page.getByText('Personnel details saved.').waitFor();
    assert.equal(writes.at(-1).body.phone,'09123456789');
    await dialog.evaluate(element => { element.scrollTop=0; });
    await page.screenshot({ path:`artifacts/employee-profiles/profile-${width}.png`,fullPage:true });
    await page.keyboard.press('Escape');
    await page.getByRole('button',{ name:'Create Employee',exact:true }).click();
    await page.getByLabel('Full name',{ exact:true }).fill('New Employee');
    await page.getByLabel('Email address',{ exact:true }).fill('new@example.com');
    await page.getByLabel('Department',{ exact:true }).fill('Finance');
    await page.getByLabel('Position',{ exact:true }).fill('Officer');
    await page.getByLabel('Staff_Support').check();
    assert.equal(await page.getByRole('textbox',{ name:/password/i }).count(),0);
    await page.getByRole('dialog').getByRole('button',{ name:'Create Employee',exact:true }).click();
    await page.getByText('Account created and group access assigned.').waitFor();
    const creation=writes.find(write => write.path === '/api/admin/users');
    assert.deepEqual(creation.body.group_ids,['support']); assert.equal(creation.body.department,'Finance'); assert.equal(creation.body.password,undefined);
    assert.equal(writes.filter(write => write.path.includes('/groups')).length,0);
    assert.deepEqual(errors,[]);
    await context.close(); console.log(`Employee profile and creation UI passed at ${width}px`);
  }
} finally { await browser.close(); }
