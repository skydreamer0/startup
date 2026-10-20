import { test, expect } from './fixtures';
import type { Locator } from '@playwright/test';
import { cases, origin, readPaths } from './contract.mjs';
import { capture, fontProof, writeJson } from '../recovery-native/evidence.mjs';
import { readReachability, stableReachability, assertLayout, readCart } from './evidence.mjs';
for(const scenario of cases)test.describe(scenario.title,()=>{
 test.use({viewport:{width:scenario.width,height:scenario.height},hasTouch:scenario.mode==='touch-capable',isMobile:scenario.mode==='touch-capable'});
 test(scenario.title,async({page,guard,isMobile,hasTouch},info)=>{
  const controls:unknown[]=[],layouts:unknown[]=[];guard.journey.scope='existing-read-only-layout';guard.journey.inputMode=scenario.mode;guard.journey.contextOptions={isMobile,hasTouch,viewport:page.viewportSize()};expect(isMobile).toBe(scenario.mode==='touch-capable');expect(hasTouch).toBe(scenario.mode==='touch-capable');
  const record=async(stage:string,selector:string)=>{guard.stage=stage;await capture(page,info.outputDir,stage,{caseId:scenario.id,nonce:guard.fixture.nonce,fonts:await fontProof(page,selector)});};
  const reachable=async(name:string,control:Locator)=>{guard.stage='control-'+name.toLowerCase();try{const receipt=await stableReachability(()=>readReachability(control));controls.push({name,...receipt});return receipt.final;}catch(error){try{writeJson(info.outputDir,'failed-geometry.json',{caseId:scenario.id,nonce:guard.fixture.nonce,name,samples:(error as {samples?:unknown[]}).samples??[]});}catch{/* Diagnostics must not replace the original reachability failure. */}throw error;}};
  const activate=async(name:string,control:Locator)=>{await reachable(name,control);if(scenario.mode==='touch-capable')await control.tap();else await control.click();};
  // Only native pointer-wheel movement of the owned visible scroller. No DOM
  // scrolling, force clicks, page scaling or locator.scrollIntoView shortcuts.
  const reveal=async(target:Locator,scroller:Locator,axis:'x'|'y')=>{
   for(let i=0;i<24;i++){
    const t=await target.boundingBox(),s=await scroller.boundingBox();expect(t&&s).toBeTruthy();
    const start=axis==='x'?t!.x:t!.y,end=start+(axis==='x'?t!.width:t!.height),low=axis==='x'?s!.x:s!.y,high=low+(axis==='x'?s!.width:s!.height);
    if(start>=low+2&&end<=high-2)return;
    const before=await scroller.evaluate((node,a)=>a==='x'?node.scrollLeft:node.scrollTop,axis);
    await page.mouse.move(s!.x+s!.width/2,s!.y+s!.height/2);
    const delta=start<low+2?-Math.max(80,low-start+8):Math.max(80,end-high+8);
    await page.mouse.wheel(axis==='x'?delta:0,axis==='y'?delta:0);
    await expect.poll(()=>scroller.evaluate((node,a)=>a==='x'?node.scrollLeft:node.scrollTop,axis),{timeout:3000}).not.toBe(before);
   }
   throw new Error('Owned pointer scroller could not reveal control within 24 moves');
  };
  const layout=async(stage:string)=>{const r=await page.evaluate(()=>{
   const rect=(s:string)=>{const r=document.querySelector(s)!.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom};};
   const v=visualViewport!;return{visualViewport:{width:v.width,height:v.height,scale:v.scale,offsetLeft:v.offsetLeft,offsetTop:v.offsetTop,pageLeft:v.pageLeft,pageTop:v.pageTop},touchPoints:navigator.maxTouchPoints,pointerCoarse:matchMedia('(pointer: coarse)').matches,width:innerWidth,height:innerHeight,documentWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth,toolbar:rect('.pos-topbar-container'),cart:rect('.pos-cart'),products:rect('.pos-product-area')};
  });assertLayout(r);expect(r.touchPoints>0).toBe(scenario.mode==='touch-capable');layouts.push({stage,...r});};
  const cart=page.locator('.pos-cart-panel');
  const snapshot=()=>readCart(cart);
  await page.goto(origin);await expect(page).toHaveURL(origin+'/login');guard.journey.beforeToken=await page.evaluate(()=>!!localStorage.getItem('pos_accessToken'));expect(guard.journey.beforeToken).toBe(false);
  await page.getByRole('textbox',{name:'員工條碼 / 員工代碼',exact:true}).fill(guard.fixture.codes.active);await page.getByTestId('login-submit-button').click();await expect(page).toHaveURL(origin+'/');
  await expect.poll(()=>readPaths.every(path=>guard.requests.some(row=>row.path===path&&row.delivered&&row.status===200)),{timeout:20_000}).toBe(true);await expect.poll(()=>guard.controllers.size,{timeout:20_000}).toBe(0);
  guard.journey.afterToken=await page.evaluate(()=>!!localStorage.getItem('pos_accessToken'));expect(guard.journey.afterToken).toBe(true);
  await layout('initial');await record('layout-ready','.pos-category-btn');
  const toolbar=page.getByRole('region',{name:'收銀工具列'}),search=page.getByTestId('product-search-input');await reveal(search,toolbar,'x');await activate('search',search);
  const chosen=guard.fixture.products[11];await search.fill(chosen.sku);await expect(page.locator('[data-testid^="product-card-"]')).toHaveCount(1);await expect(page.getByTestId(`product-card-${chosen.id}`)).toContainText(chosen.name);guard.journey.searchFound=chosen.id;
  await search.fill('');await expect(page.locator('[data-testid^="product-card-"]')).toHaveCount(12);await expect.poll(()=>guard.controllers.size,{timeout:20_000}).toBe(0);
  const grid=page.locator('.pos-product-grid');
  for(const product of guard.fixture.products){const card=page.getByTestId(`product-card-${product.id}`);await reveal(card,grid,'y');await activate('add-'+product.sku,card);}
  const total=cart.getByTestId('cart-total');await reveal(total,cart,'y');await reachable('cart-total',total);
  guard.journey.populated=await snapshot();expect(guard.journey.populated.products).toHaveLength(12);expect(guard.journey.populated.total).toBe(240);await layout('populated');await record('cart-populated','.pos-cart-panel > div:first-child > div:first-child');
  const checkout=page.getByTestId('cart-checkout-button');await reveal(checkout,cart,'y');await activate('checkout',checkout);
  const payment=page.getByRole('dialog',{name:'確認結帳',exact:true});await expect(payment).toBeVisible();await expect(payment).toContainText('$240 元');await expect(payment.getByRole('button',{name:'確認付款'})).toBeDisabled();
  await expect(payment.getByLabel('收取金額')).toBeFocused();await payment.getByLabel('收取金額').fill('240');
  // Real Tab cycle, no focus()/DOM event replacement: reach each enabled
  // control and prove the last cycles back to the first within the dialog.
  const paymentControls=payment.locator('button:not(:disabled),input:not(:disabled)');const count=await paymentControls.count();
  for(let i=0;i<count+1;i++){await page.keyboard.press('Tab');expect(await payment.evaluate(node=>node.contains(document.activeElement))).toBe(true);}
  await record('payment-open','#payment-title');await activate('payment-cancel',payment.getByRole('button',{name:'取消',exact:true}));await expect(payment).toBeHidden();await expect(checkout).toBeFocused();guard.journey.paymentCancelled=await snapshot();expect(guard.journey.paymentCancelled).toEqual(guard.journey.populated);await record('payment-cancelled','.pos-cart-panel > div:first-child > div:first-child');
  const split=cart.getByRole('button',{name:'拆單',exact:true});await reveal(split,cart,'y');await activate('split',split);const splitDialog=page.getByRole('dialog',{name:'拆單付款',exact:true});await expect(splitDialog).toBeVisible();await expect(splitDialog).toContainText('$240');await record('split-open','[data-pos-modal="split-payment"] h3');await activate('split-cancel',splitDialog.getByRole('button',{name:'取消',exact:true}));await expect(splitDialog).toBeHidden();await expect(split).toBeFocused();guard.journey.splitCancelled=await snapshot();expect(guard.journey.splitCancelled).toEqual(guard.journey.populated);await record('split-cancelled','.pos-cart-panel > div:first-child > div:first-child');
  const shift=toolbar.getByRole('button',{name:'交班',exact:true});await reveal(shift,toolbar,'x');await activate('shift',shift);const shiftDialog=page.getByRole('dialog',{name:'確認交班',exact:true});await expect(shiftDialog).toBeVisible();await record('shift-open','[data-pos-modal="close-shift"] h3');await activate('shift-cancel',shiftDialog.getByRole('button',{name:'取消',exact:true}));await expect(shiftDialog).toBeHidden();await expect(shift).toBeFocused();guard.journey.shiftCancelled=await snapshot();expect(guard.journey.shiftCancelled).toEqual(guard.journey.populated);await record('shift-cancelled','.pos-cart-panel > div:first-child > div:first-child');
  const clear=cart.getByRole('button',{name:'清空購物車 (F5)',exact:true});await reveal(clear,cart,'y');await activate('clear-first',clear);expect(await snapshot()).toEqual(guard.journey.populated);await activate('clear-confirm',cart.getByRole('button',{name:'再按一次確認清空',exact:true}));guard.journey.cleared=await snapshot();expect(guard.journey.cleared).toEqual({products:[],total:0,discount:0});await layout('cleared');await record('cart-cleared','.pos-cart-panel > div:first-child > div:first-child');
  expect(guard.requests.filter(r=>r.method!=='GET')).toHaveLength(1);await expect.poll(()=>guard.controllers.size,{timeout:20_000}).toBe(0);
  writeJson(info.outputDir,'layout-geometry.json',{caseId:scenario.id,nonce:guard.fixture.nonce,controls,layouts});
 });
});
