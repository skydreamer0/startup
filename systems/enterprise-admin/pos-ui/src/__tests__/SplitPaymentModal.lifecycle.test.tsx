import { useState } from 'react';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import SplitPaymentModal from '../components/SplitPaymentModal';
import AdminPinModal from '../components/AdminPinModal';
import { useCartStore } from '../store/cartStore';
import { useCheckoutRecoveryStore } from '../store/checkoutRecoveryStore';
beforeEach(() => {
  useCheckoutRecoveryStore.setState({scope:null,pending:null});
  useCartStore.setState({items:[{product:{id:'review-product',name:'Synthetic review',sku:'REV',retailPrice:100,stockQuantity:20},quantity:2,discountRate:0}],orderDiscountAmount:0,orderDiscountNote:'',paymentMethod:'CASH',currentSalesStaffId:null,heldCarts:[]});
});
afterEach(cleanup);
it('preserves exact two-entry callback payload and cart',async()=>{
  const user=userEvent.setup(); const confirm=vi.fn(); const before=useCartStore.getState();
  render(<SplitPaymentModal loading={false} onClose={vi.fn()} onConfirm={confirm}/>);
  const amount=screen.getByRole('spinbutton',{name:'第 1 筆付款金額'});
  await user.clear(amount); await user.type(amount,'150');
  await user.click(screen.getByRole('button',{name:'+ 加入第二付款方式'}));
  expect(screen.getByRole('spinbutton',{name:'第 2 筆付款金額'})).toHaveValue(50);
  await user.click(screen.getByRole('button',{name:'確認付款'}));
  expect(confirm).toHaveBeenCalledExactlyOnceWith([{method:'CASH',amount:150},{method:'CARD',amount:50}]);
  expect(useCartStore.getState()).toBe(before);
});
it('late close after PIN opens leaves the newer PIN focus and keyboard intact',async()=>{
  let finish!:()=>void; const done=new Promise<void>(r=>{finish=r;});
  function Flow(){const [old,setOld]=useState(true); const [pin,setPin]=useState(false);return <main>
    {old&&<SplitPaymentModal suspended={pin} loading={false} onClose={()=>setOld(false)} onConfirm={()=>{setPin(true);void done.then(()=>setOld(false));}}/>}
    {pin&&<AdminPinModal reason="Synthetic" onConfirm={vi.fn()} onClose={()=>setPin(false)}/>}
  </main>}
  const user=userEvent.setup();render(<Flow/>);
  await user.click(screen.getByRole('button',{name:'確認付款'}));
  const pin=screen.getByRole('dialog',{name:'管理員授權'});const digit=within(pin).getByRole('button',{name:'1'});
  expect(digit).toHaveFocus();await act(async()=>{finish();await done;});
  expect(digit).toHaveFocus();expect(pin.closest('[inert], [aria-hidden="true"]')).toBeNull();
  await user.tab({shift:true});expect(within(pin).getByRole('button',{name:'取消'})).toHaveFocus();
});
it('PIN cleanup does not focus its opener over a newer dialog',async()=>{
  const user=userEvent.setup();
  function Flow(){const [pin,setPin]=useState(false);return <main><button onClick={()=>setPin(true)}>Open PIN</button>{pin&&<AdminPinModal reason="Synthetic" onConfirm={vi.fn()} onClose={()=>setPin(false)}/>}</main>}
  const view=render(<Flow/>);await user.click(screen.getByRole('button',{name:'Open PIN'}));
  const newer=document.createElement('button');newer.textContent='New dialog action';document.body.appendChild(newer);newer.focus();
  view.unmount();expect(newer).toHaveFocus();newer.remove();
});
