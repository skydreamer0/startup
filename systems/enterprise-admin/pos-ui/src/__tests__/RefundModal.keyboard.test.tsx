import '@testing-library/jest-dom/vitest';
import type { PosOrderSummary } from '../api/pos';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import RefundModal from '../components/RefundModal';
afterEach(cleanup);
const order: PosOrderSummary = { id:'synthetic-order', orderNumber:'SYN-001', status:'completed', paymentMethod:'CASH', createdAt:new Date().toISOString(), totalAmount:'20', discountAmount:'0', items:[{id:'item', productId:'product', product:{id:'product',sku:'SYNTHETIC',name:'Synthetic item'}, quantity:1,unitPrice:'20',finalUnitPrice:'20'}] };
function mount(loading=false){const close=vi.fn(),confirm=vi.fn().mockResolvedValue(undefined);render(<RefundModal order={order} onClose={close} onConfirm={confirm} loading={loading}/>);return{close,confirm};}
it('refund has an explicitly named modal dialog for keyboard and assistive entry',()=>{mount();expect(screen.getByRole('dialog',{name:'登記退款'})).toHaveAttribute('aria-modal','true');});
it('pending refund cannot be dismissed by its backdrop while the result is unknown',()=>{const x=mount(true);const input=screen.getByLabelText('退款原因（選填）');const panel=input.parentElement!.parentElement!;fireEvent.click(panel.parentElement!);expect(x.close).not.toHaveBeenCalled();expect(x.confirm).not.toHaveBeenCalled();});
it('idle refund Escape cancels without submitting',()=>{const x=mount();fireEvent.keyDown(screen.getByLabelText('退款原因（選填）'),{key:'Escape'});expect(x.close).toHaveBeenCalledTimes(1);expect(x.confirm).not.toHaveBeenCalled();});
it('existing pending confirm and cancel remain disabled with unchanged money-only warning',()=>{const x=mount(true);expect(screen.getByRole('button',{name:'取消'})).toBeDisabled();expect(screen.getByRole('button',{name:'退款登記中...'})).toBeDisabled();expect(screen.getByText(/此操作只登記退款，不會增加庫存/)).toBeVisible();fireEvent.click(screen.getByRole('button',{name:'退款登記中...'}));expect(x.confirm).not.toHaveBeenCalled();});

it('focus starts in reason, traps both Tab ends and blocks POS shortcuts without submission',()=>{
 const x=mount();const reason=screen.getByLabelText('退款原因（選填）');const confirm=screen.getByRole('button',{name:'確認退款'});
 expect(reason).toHaveFocus();fireEvent.keyDown(reason,{key:'Tab',shiftKey:true});expect(confirm).toHaveFocus();
 fireEvent.keyDown(confirm,{key:'Tab'});expect(reason).toHaveFocus();
 const listener=vi.fn();window.addEventListener('keydown',listener);
 for(const key of ['F2','F4','F5','F7','F8','Enter'])fireEvent.keyDown(reason,{key});
 window.removeEventListener('keydown',listener);expect(listener).not.toHaveBeenCalled();expect(x.confirm).not.toHaveBeenCalled();
});
it('pending owns focus, ignores Escape and never edits the submitted reason',()=>{
 const x=mount(true);const dialog=screen.getByRole('dialog');expect(dialog).toHaveFocus();
 expect(screen.getByLabelText('退款原因（選填）')).toBeDisabled();fireEvent.keyDown(dialog,{key:'Tab'});expect(dialog).toHaveFocus();
 fireEvent.keyDown(dialog,{key:'Escape'});expect(x.close).not.toHaveBeenCalled();
});
it('same-turn repeated activation submits original order/reason once and blocks immediate backdrop cancellation',async()=>{
 let finish!:()=>void;const close=vi.fn();const confirm=vi.fn(()=>{fireEvent.click(document.querySelector('[data-pos-modal="refund"]')!);return new Promise<void>(resolve=>{finish=resolve;});});
 render(<RefundModal order={order} onClose={close} onConfirm={confirm} loading={false}/>);
 fireEvent.change(screen.getByLabelText('退款原因（選填）'),{target:{value:'合成原因 原字'}});
 const button=screen.getByRole('button',{name:'確認退款'});fireEvent.click(button);fireEvent.click(button);
 expect(confirm).toHaveBeenCalledTimes(1);expect(confirm).toHaveBeenCalledWith('synthetic-order','合成原因 原字');expect(close).not.toHaveBeenCalled();
 await import('@testing-library/react').then(({act})=>act(async()=>{finish();}));
 expect(screen.getByRole('button',{name:'確認退款'})).toBeEnabled();
});
it('restores original background attributes, scroll and connected opener after closing',async()=>{
 const background=document.createElement('div');background.setAttribute('aria-hidden','false');const opener=document.createElement('button');background.append(opener);document.body.append(background);document.body.style.overflow='auto';opener.focus();
 const view=render(<RefundModal order={order} onClose={()=>{}} onConfirm={async()=>{}} loading={false}/>);
 expect(background).toHaveAttribute('inert');expect(background).toHaveAttribute('aria-hidden','true');expect(document.body.style.overflow).toBe('hidden');
 view.unmount();await Promise.resolve();expect(background).not.toHaveAttribute('inert');expect(background).toHaveAttribute('aria-hidden','false');expect(document.body.style.overflow).toBe('auto');expect(opener).toHaveFocus();background.remove();document.body.style.overflow='';
});
it('IME Escape does not cancel and pointer on the panel never closes',()=>{
 const x=mount();expect(fireEvent.keyDown(screen.getByLabelText('退款原因（選填）'),{key:'Escape',isComposing:true})).toBe(true);expect(fireEvent.keyDown(screen.getByLabelText('退款原因（選填）'),{key:'Enter',isComposing:true})).toBe(true);fireEvent.click(screen.getByRole('dialog'));expect(x.close).not.toHaveBeenCalled();
 fireEvent.click(document.querySelector('[data-pos-modal="refund"]')!);expect(x.close).toHaveBeenCalledTimes(1);expect(x.confirm).not.toHaveBeenCalled();
});
it('long labels and all original money amounts remain literal with no policy recalculation',()=>{
 render(<RefundModal order={{...order,orderNumber:'SYN-VERY-LONG'.repeat(10),items:[{...order.items[0],product:{...order.items[0].product,name:'合成很長的商品名稱'.repeat(20)}}]}} onClose={()=>{}} onConfirm={async()=>{}} loading={false}/>);
 expect(screen.getByText('合成很長的商品名稱'.repeat(20)+' × 1')).toBeVisible();expect(screen.getByText(/退款金額 \$20 元/)).toBeVisible();expect(screen.getByText('-$20')).toBeVisible();
});
