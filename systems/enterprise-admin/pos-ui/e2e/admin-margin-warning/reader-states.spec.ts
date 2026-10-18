import {test,expect,origin} from './fixtures';
import type {Page,TestInfo,Locator} from '@playwright/test';
import {writeFile} from 'node:fs/promises';
const contact='SYNTHETIC_READER_CONTACT';
const product='SYNTHETIC_READER_PRODUCT';
const supplier=[{id:'reader-supplier',name:contact,email:'synthetic-reader@example.invalid',phone:'000',deliveryReliability:0,defectRate:0}];
const abc={summary:{star:1,cash_cow:0,hidden_gem:0,underperformer:0},medianRevenue:9,medianMargin:2,products:[{id:'reader-product',name:product,sku:'SYNTHETIC',quadrant:'star',totalQuantity:1,totalRevenue:9,marginPct:2}]};
const ranking=[{id:'reader-supplier',name:contact,totalRevenue:9,revenueShare:100,avgMarginPct:2,deliveryReliability:null,compositeScore:4,productCount:1}];
const success=(url:URL)=>({status:200,data:url.pathname.endsWith('/product-abc')?abc:url.pathname.endsWith('/supplier-ranking')?ranking:supplier});
const routes={suppliers:'/suppliers',analytics:'/inventory/analytics'};
const labels={suppliers:'重試供應商清單',analytics:'重試商品分析'};
async function tabTo(page:Page,target:Locator){for(let i=0;i<90;i++){await page.keyboard.press('Tab');if(await target.evaluate(el=>document.activeElement===el))return;}throw Error('Reader control is not keyboard reachable');}
async function capture(page:Page,info:TestInfo,name:string,target:Locator){
 await tabTo(page,target);await expect(target).toBeFocused();await target.scrollIntoViewIfNeeded();await page.evaluate(()=>document.fonts.ready);
 const geometry=await target.evaluate(el=>{const b=el.getBoundingClientRect();return {subject:'inventory-reader',keyboardReachable:document.activeElement===el,target:{x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height},viewport:{width:innerWidth,height:innerHeight},documentWidth:document.documentElement.scrollWidth};});
 expect(geometry.target.x).toBeGreaterThanOrEqual(0);expect(geometry.target.right).toBeLessThanOrEqual(geometry.viewport.width+1);
 const image=info.outputPath(name+'.png'),measure=info.outputPath(name+'.json');await page.screenshot({path:image,fullPage:false});await writeFile(measure,JSON.stringify(geometry,null,2));await info.attach(name+'.png',{path:image,contentType:'image/png'});await info.attach(name+'.json',{path:measure,contentType:'application/json'});
}
async function leaveAndReturn(page:Page,subject:'suppliers'|'analytics',time:number){
 await page.clock.setFixedTime(new Date(time));const other=subject==='suppliers'?'analytics':'suppliers';
 await page.locator(`a[href="${routes[other]}"]`).click();await page.locator(`a[href="${routes[subject]}"]`).click();
}
for(const subject of ['suppliers','analytics'] as const)for(const width of [1440,390])test.describe(`${subject}-${width}`,()=>{
 test.use({viewport:{width,height:width===390?844:900}});
 test(`reader-${subject} ${width}: initial retry`,async({page,harness},info)=>{
  harness.readerHandler=()=>({status:500});await page.goto(origin+routes[subject]);const retry=page.getByRole('button',{name:labels[subject],exact:true});await expect(retry).toBeVisible();await expect(page.getByText(subject==='suppliers'?contact:product,{exact:true})).toHaveCount(0);await capture(page,info,'reader-before',retry);
  harness.readerHandler=success;await page.keyboard.press('Enter');await expect(page.getByText(subject==='suppliers'?contact:product,{exact:true})).toBeVisible();await expect(retry).toHaveCount(0);
  const control=subject==='suppliers'?page.getByRole('button',{name:'Add Supplier',exact:true}):page.getByRole('button',{name:'🏢 Supplier Ranking',exact:true});await capture(page,info,'reader-after',control);expect(harness.authWrites).toEqual([]);
 });
 for(const status of [401,403])test(`reader-${subject} ${width}: denial ${status}`,async({page,harness},info)=>{
  await page.addInitScript(()=>localStorage.setItem('refreshToken','synthetic-reader-refresh'));
  harness.readerHandler=success;await page.goto(origin+routes[subject]);await expect(page.getByText(subject==='suppliers'?contact:product,{exact:true})).toBeVisible();
  harness.readerHandler=()=>({status});await leaveAndReturn(page,subject,Date.parse('2026-10-10T12:01:00Z'));const retry=page.getByRole('button',{name:labels[subject],exact:true});await expect(retry).toBeVisible();await expect(page.getByText('存取被拒絕',{exact:false}).first()).toBeVisible();await expect(page.getByText(subject==='suppliers'?contact:product,{exact:true})).toHaveCount(0);
  if(subject==='analytics'){await page.getByRole('button',{name:'🏢 Supplier Ranking',exact:true}).click();await expect(page.getByText(contact,{exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'重試供應商排行',exact:true})).toBeVisible();await capture(page,info,'ranking-denied',page.getByRole('button',{name:'重試供應商排行',exact:true}));await page.getByRole('button',{name:'📦 ABC Product Analysis',exact:true}).click();}
  await capture(page,info,'reader-before',retry);
  harness.readerHandler=()=>({status:500});await page.keyboard.press('Enter');await expect.poll(()=>harness.readerResponses.filter(x=>x.endpoint===(subject==='suppliers'?'/inventory/suppliers':'/analytics/product-abc')&&x.status===500).length).toBeGreaterThan(0);await expect(retry).toBeEnabled();await expect(page.getByText(subject==='suppliers'?contact:product,{exact:true})).toHaveCount(0);
  // Remount the denied query after a generic error: cached success must remain hidden.
  const beforeRanking=harness.readerResponses.filter(x=>x.endpoint==='/analytics/supplier-ranking'&&x.status===500).length;
  const beforeRemount=harness.readerResponses.filter(x=>x.endpoint===(subject==='suppliers'?'/inventory/suppliers':'/analytics/product-abc')&&x.status===500).length;
  await leaveAndReturn(page,subject,Date.parse('2026-10-10T12:02:00Z'));await expect.poll(()=>harness.readerResponses.filter(x=>x.endpoint===(subject==='suppliers'?'/inventory/suppliers':'/analytics/product-abc')&&x.status===500).length).toBeGreaterThan(beforeRemount);await expect(retry).toBeVisible();await expect(retry).toBeEnabled();await expect(page.getByText(subject==='suppliers'?contact:product,{exact:true})).toHaveCount(0);
  if(subject==='analytics')await expect.poll(()=>harness.readerResponses.filter(x=>x.endpoint==='/analytics/supplier-ranking'&&x.status===500).length).toBeGreaterThan(beforeRanking);
  harness.readerHandler=success;
  if(subject==='analytics'){
    await page.getByRole('button',{name:'🏢 Supplier Ranking',exact:true}).click();await expect(page.getByText(contact,{exact:true})).toHaveCount(0);
    const prior=harness.readerResponses.filter(x=>x.endpoint==='/analytics/supplier-ranking'&&x.status===200).length;await page.getByRole('button',{name:'重試供應商排行',exact:true}).click();await expect.poll(()=>harness.readerResponses.filter(x=>x.endpoint==='/analytics/supplier-ranking'&&x.status===200).length).toBeGreaterThan(prior);await expect(page.getByText(contact,{exact:true})).toBeVisible();await capture(page,info,'ranking-recovered',page.getByRole('button',{name:'📦 ABC Product Analysis',exact:true}));
    await page.getByRole('button',{name:'📦 ABC Product Analysis',exact:true}).click();await expect(page.getByText(product,{exact:true})).toHaveCount(0);
  }
  await retry.click();await expect(page.getByText(subject==='suppliers'?contact:product,{exact:true})).toBeVisible();
  const control=subject==='suppliers'?page.getByRole('button',{name:'Add Supplier',exact:true}):page.getByRole('button',{name:'🏢 Supplier Ranking',exact:true});await capture(page,info,'reader-after',control);
  expect(harness.authWrites.every(path=>path==='/api/v1/admin/auth/refresh')).toBe(true);
 });
});
test('reader-suppliers 1440: identity change',async({page,harness},info)=>{
 await page.setViewportSize({width:1440,height:900});harness.readerHandler=success;await page.goto(origin+'/suppliers');await expect(page.getByText(contact,{exact:true})).toBeVisible();await page.getByRole('button',{name:'Edit',exact:true}).click();await expect(page.locator('input').first()).toHaveValue(contact);await capture(page,info,'reader-before',page.getByRole('button',{name:'Cancel',exact:true}));
 await tabTo(page,page.getByRole('button',{name:'Logout',exact:true}));await page.keyboard.press('Enter');await expect(page.locator('#login-email')).toBeVisible();await expect(page.getByText(contact,{exact:true})).toHaveCount(0);
 harness.readerId='synthetic-other-reader';harness.readerHandler=()=>({status:200,data:[]});await page.locator('#login-email').fill('synthetic@example.invalid');await page.locator('#login-password').fill('synthetic-password-not-a-credential');await page.locator('#login-submit').click();await page.locator('a[href="/suppliers"]').click();await expect(page.getByText('No suppliers found',{exact:false})).toBeVisible();await expect(page.getByText(contact,{exact:true})).toHaveCount(0);expect(await page.locator('input').evaluateAll(inputs=>inputs.map(input=>(input as HTMLInputElement).value))).not.toContain(contact);await capture(page,info,'reader-after',page.getByRole('button',{name:'Add Supplier',exact:true}));expect(harness.authWrites).toEqual(['/api/v1/admin/auth/logout','/api/v1/admin/auth/login']);
});
