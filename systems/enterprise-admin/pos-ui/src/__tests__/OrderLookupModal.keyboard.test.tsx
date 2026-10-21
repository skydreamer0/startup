import '@testing-library/jest-dom/vitest';
import type { PosOrderSummary } from '../api/pos';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import OrderLookupModal from '../components/OrderLookupModal';
import { AxiosHeaders } from 'axios';
import { posApi } from '../api/pos';
let client:QueryClient;
afterEach(()=>{cleanup();client?.clear();vi.restoreAllMocks();});
const order: PosOrderSummary = { id:'synthetic-order', orderNumber:'SYN-001', status:'completed', paymentMethod:'CASH', createdAt:new Date().toISOString(), totalAmount:'20', discountAmount:'0', items:[{id:'item', productId:'product', product:{id:'product',sku:'SYNTHETIC',name:'Synthetic item'}, quantity:1,unitPrice:'20',finalUnitPrice:'20'}] };
function mount(){client=new QueryClient({defaultOptions:{queries:{retry:false}}});vi.spyOn(posApi,'getTodayOrders').mockResolvedValue({data:{success:true,data:[order]},status:200,statusText:'OK',headers:{},config:{headers:new AxiosHeaders()}});const close=vi.fn(),refund=vi.fn();render(<QueryClientProvider client={client}><OrderLookupModal checkoutScope="tenant:cashier" onClose={close} onRefund={refund}/></QueryClientProvider>);return{close,refund};}
it('lookup entry is a named dialog with an explicit search label and close name',async()=>{mount();await screen.findByText('SYN-001');expect(screen.getByRole('dialog',{name:'今日訂單'})).toHaveAttribute('aria-modal','true');expect(screen.getByRole('textbox',{name:'搜尋今日訂單'})).toHaveFocus();expect(screen.getByRole('button',{name:'關閉今日訂單'})).toBeVisible();});
it('resolved query row exposes a native keyboard disclosure before the refund action',async()=>{const x=mount();await screen.findByText('SYN-001');const button=screen.getByRole('button',{name:/SYN-001/});expect(button).toHaveAttribute('aria-expanded','false');expect(screen.queryByRole('button',{name:'退款此訂單'})).not.toBeInTheDocument();fireEvent.click(button);expect(button).toHaveAttribute('aria-expanded','true');fireEvent.click(screen.getByRole('button',{name:'退款此訂單'}));expect(x.refund).toHaveBeenCalledWith(order);expect(posApi.getTodayOrders).toHaveBeenCalledTimes(1);});
it('Escape cancels lookup without ever choosing a refund',async()=>{const x=mount();await screen.findByText('SYN-001');fireEvent.keyDown(screen.getByRole('textbox'),{key:'Escape'});expect(x.close).toHaveBeenCalledTimes(1);expect(x.refund).not.toHaveBeenCalled();});
