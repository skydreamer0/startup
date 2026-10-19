import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, Link } from 'react-router-dom';
import { AuthContext, type AuthContextType } from '../../hooks/authContext';
import Page from './ReceivingDraftPage';
const api = vi.hoisted(() => ({ get: vi.fn(), put: vi.fn(), post: vi.fn() }));
vi.mock('../../api/client', () => ({ default: api }));
const id = '11111111-1111-4111-8111-111111111111';
const payload = { title: '測試草稿', lines: [] };
const saved = { id, tenantId: 'tenant-a', ownerId: 'actor-a', revision: 1, updatedAt: '2026-10-18T00:00:00Z', payload };
const wrap = (data: unknown) => ({ data: { success: true, data } });
const auth = (): AuthContextType => ({ user: { id: 'actor-a', email: 'synthetic@example.test', fullName: 'Synthetic', roles: [], permissions: ['read:products','create:products'] }, loading: false, hasPermission: () => true, login: async () => {}, logout() {}, demoLogin() {} });
function mount(value=auth(), url='/receiving') {
 const router=createMemoryRouter([{path:'/receiving',element:<AuthContext.Provider value={value}><Link to="/other">離開連結</Link><Page /></AuthContext.Provider>},{path:'/other',element:<p>其他頁</p>}],{initialEntries:['/other',url],initialIndex:1});
 return {...render(<RouterProvider router={router}/>),router};
}
beforeEach(() => { vi.resetAllMocks(); api.get.mockImplementation((url: string) => Promise.resolve(wrap(url === '/inventory/products' ? { data: [], total: 0 } : url === '/receiving-drafts' ? { tenantId: 'tenant-a', ownerId: 'actor-a', data: [], total: 0, page: 1, limit: 50 } : saved))); });
afterEach(cleanup);
it('performs no reads before identity and permission are established', () => { mount({...auth(), loading:true}); expect(api.get).not.toHaveBeenCalled(); });
it('denies unauthorized readers without exposing a list', () => { mount({...auth(), hasPermission:()=>false}); expect(screen.getByRole('alert').textContent).toContain('無權限'); expect(api.get).not.toHaveBeenCalled(); });
it('opens an existing private draft and keeps read-only users from mutations', async () => { mount({...auth(), hasPermission:p=>p==='read:products'}, '/receiving?draft='+id); await screen.findByDisplayValue('測試草稿'); expect((screen.getByText('保存草稿') as HTMLButtonElement).disabled).toBe(true); expect(api.put).not.toHaveBeenCalled(); });
it('creates a new private draft and saves once with CAS zero', async () => {
 api.put.mockImplementation((url:string, body:{payload:typeof payload})=>Promise.resolve(wrap({...saved,id:url.split('/').pop(),payload:body.payload})));
 mount(); await waitFor(()=>expect((screen.getByText('新增私人草稿') as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(screen.getByText('新增私人草稿'));
 await screen.findByLabelText('草稿名稱'); fireEvent.click(screen.getByText('保存草稿')); await waitFor(()=>expect(api.put).toHaveBeenCalledTimes(1));
 expect(api.put.mock.calls[0][1].expectedRevision).toBe(0); expect(api.post).not.toHaveBeenCalled();
});
it('recovers a lost save response with GET without a second PUT', async () => {
 api.put.mockRejectedValue(new Error('lost response')); mount(auth(), '/receiving?draft='+id); const input=await screen.findByDisplayValue('測試草稿'); fireEvent.change(input,{target:{value:'修改後'}}); fireEvent.click(screen.getByText('保存草稿'));
 await screen.findByText('查回保存結果'); expect((screen.getByText('保存草稿') as HTMLButtonElement).disabled).toBe(true);
 api.get.mockResolvedValue(wrap({...saved,revision:2,payload:{...payload,title:'修改後'}})); fireEvent.click(screen.getByText('查回保存結果'));
 await screen.findByText('查回內容與本次草稿完全一致，已確認保存，沒有再次送出。'); expect(api.put).toHaveBeenCalledTimes(1); expect(api.post).not.toHaveBeenCalled();
});
it('hides the private draft after save authorization denial', async () => {
 api.put.mockRejectedValue({response:{status:403}}); mount(auth(), '/receiving?draft='+id); fireEvent.change(await screen.findByDisplayValue('測試草稿'),{target:{value:'私人資料'}}); fireEvent.click(screen.getByText('保存草稿'));
 await screen.findByText('登入或權限已變更，已隱藏草稿。請重新登入後開啟。'); expect(screen.queryByDisplayValue('私人資料')).toBeNull();
});
it('does not expose a response belonging to another actor', async () => { api.get.mockImplementation((url:string)=>Promise.resolve(wrap(url==='/receiving-drafts'?{tenantId:'tenant-a',ownerId:'actor-b',data:[],total:0}: {data:[],total:0}))); mount(); await screen.findByRole('alert'); expect(screen.queryByText('新增私人草稿')).toBeNull(); });
it('compares conflicting content without overwriting either side until explicit choice', async () => {
 api.put.mockRejectedValue({response:{status:409}}); mount(auth(),'/receiving?draft='+id); fireEvent.change(await screen.findByDisplayValue('測試草稿'),{target:{value:'本頁版本'}}); fireEvent.click(screen.getByText('保存草稿')); await screen.findByText('查回保存結果');
 api.get.mockResolvedValue(wrap({...saved,revision:3,payload:{...payload,title:'遠端版本'}})); fireEvent.click(screen.getByText('查回保存結果')); await screen.findByRole('region',{name:'伺服器版本比較'}); expect(screen.getByDisplayValue('本頁版本')).toBeDefined(); expect(api.put).toHaveBeenCalledTimes(1);
 fireEvent.click(screen.getByText('保留本頁內容，準備另存下一版')); api.put.mockImplementation((_url:string,body:{payload:typeof payload})=>Promise.resolve(wrap({...saved,revision:4,payload:body.payload})));fireEvent.click(screen.getByText('保存草稿'));await waitFor(()=>expect(api.put).toHaveBeenCalledTimes(2));expect(api.put.mock.calls[1][1].expectedRevision).toBe(3);
});
it('shows historical content read-only without altering the current draft',async()=>{
 mount(auth(),'/receiving?draft='+id);await screen.findByDisplayValue('測試草稿');api.get.mockImplementation((url:string)=>Promise.resolve(wrap(url.endsWith('/history')?[{revision:1,createdAt:'2026-10-18'}]:{...saved,payload:{...payload,title:'歷史內容'}})));
 fireEvent.click(screen.getByText('查看版本歷史'));fireEvent.click(await screen.findByText('版本 1 · 2026-10-18'));await screen.findByText('歷史版本 1，僅供核對，不會覆蓋目前草稿。');expect(screen.getByDisplayValue('測試草稿')).toBeDefined();expect(api.put).not.toHaveBeenCalled();
});
it('requires explicit discard for unsaved content and preserves saved server records',async()=>{
 mount(auth(),'/receiving?draft='+id);fireEvent.change(await screen.findByDisplayValue('測試草稿'),{target:{value:'尚未保存'}});fireEvent.click(screen.getByText('關閉本頁草稿'));expect(screen.getByRole('dialog')).toBeDefined();fireEvent.click(screen.getByText('繼續編輯'));expect(screen.getByDisplayValue('尚未保存')).toBeDefined();fireEvent.click(screen.getByText('關閉本頁草稿'));fireEvent.click(screen.getByText('確認放棄未保存內容'));await waitFor(()=>expect(screen.queryByDisplayValue('尚未保存')).toBeNull());expect(api.put).not.toHaveBeenCalled();expect(api.post).not.toHaveBeenCalled();
});
it.each(['new-','new-not-a-uuid','bad'])('handles invalid draft link %s without crashing or creating a draft',async value=>{mount(auth(),'/receiving?draft='+value);await screen.findByText('草稿連結格式無效，請回到清單重新選取。');expect(screen.queryByText('保存草稿')).toBeNull();expect(api.put).not.toHaveBeenCalled();fireEvent.click(screen.getByText('回到草稿清單'));await waitFor(()=>expect(screen.queryByText('草稿連結格式無效，請回到清單重新選取。')).toBeNull());});
it('blocks sidebar Link navigation and preserves changes after cancel',async()=>{mount(auth(),'/receiving?draft='+id);fireEvent.change(await screen.findByDisplayValue('測試草稿'),{target:{value:'保留我'}});fireEvent.click(screen.getByText('離開連結'));await screen.findByRole('dialog',{name:'離開草稿確認'});expect(screen.queryByText('其他頁')).toBeNull();fireEvent.click(screen.getByText('留在草稿'));expect(screen.getByDisplayValue('保留我')).toBeDefined();fireEvent.click(screen.getByText('離開連結'));fireEvent.click(screen.getByText('放棄未保存變更並離開'));await screen.findByText('其他頁');});
it('blocks history Back and search-parameter replacement until explicit discard',async()=>{const {router}=mount(auth(),'/receiving?draft='+id);fireEvent.change(await screen.findByDisplayValue('測試草稿'),{target:{value:'不可消失'}});await router.navigate(-1);await screen.findByRole('dialog',{name:'離開草稿確認'});expect(screen.getByDisplayValue('不可消失')).toBeDefined();fireEvent.click(screen.getByText('留在草稿'));await router.navigate('/receiving?draft=new-22222222-2222-4222-8222-222222222222');await screen.findByRole('dialog',{name:'離開草稿確認'});expect(screen.getByDisplayValue('不可消失')).toBeDefined();fireEvent.click(screen.getByText('留在草稿'));});
it('does not allow abandoning a pending or uncertain write via SPA navigation',async()=>{let reject!:(e:unknown)=>void;api.put.mockImplementation(()=>new Promise((_resolve,fail)=>{reject=fail;}));mount(auth(),'/receiving?draft='+id);fireEvent.change(await screen.findByDisplayValue('測試草稿'),{target:{value:'寫入中'}});fireEvent.click(screen.getByText('保存草稿'));fireEvent.click(screen.getByText('離開連結'));await screen.findByRole('dialog',{name:'離開草稿確認'});expect((screen.getByText('放棄未保存變更並離開') as HTMLButtonElement).disabled).toBe(true);reject(new Error('lost'));await screen.findByText('查回保存結果');expect((screen.getByText('放棄未保存變更並離開') as HTMLButtonElement).disabled).toBe(true);fireEvent.click(screen.getByText('留在草稿'));expect(screen.getByDisplayValue('寫入中')).toBeDefined();expect(api.put).toHaveBeenCalledTimes(1);});
it('refreshes confirmed saved summaries so create-save-close-reopen works without browser reload',async()=>{
 let stored:typeof saved|undefined;
 api.get.mockImplementation((url:string)=>Promise.resolve(wrap(url==='/inventory/products'?{data:[],total:0}:url==='/receiving-drafts'?{tenantId:'tenant-a',ownerId:'actor-a',data:stored?[{id:stored.id,title:stored.payload.title,revision:stored.revision}]:[],total:stored?1:0,page:1,limit:50}:stored)));
 api.put.mockImplementation((url:string,body:{payload:typeof payload})=>{stored={...saved,id:url.split('/').pop()!,payload:body.payload};return Promise.resolve(wrap(stored));});
 mount();await waitFor(()=>expect((screen.getByText('新增私人草稿') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('新增私人草稿'));fireEvent.change(await screen.findByLabelText('草稿名稱'),{target:{value:'可重開草稿'}});fireEvent.click(screen.getByText('保存草稿'));await screen.findByText('可重開草稿 · v1');fireEvent.click(screen.getByText('關閉本頁草稿'));await waitFor(()=>expect(screen.queryByLabelText('草稿名稱')).toBeNull());fireEvent.click(screen.getByText('可重開草稿 · v1'));await screen.findByDisplayValue('可重開草稿');expect(api.put).toHaveBeenCalledTimes(1);
});
it('normalizes a new draft URL after unknown save recovery so reload opens the committed record',async()=>{
 let stored:typeof saved|undefined;
 api.get.mockImplementation((url:string)=>Promise.resolve(wrap(url==='/inventory/products'?{data:[],total:0}:url==='/receiving-drafts'?{tenantId:'tenant-a',ownerId:'actor-a',data:[],total:0,page:1,limit:50}:stored)));
 api.put.mockImplementation((url:string,body:{payload:typeof payload})=>{stored={...saved,id:url.split('/').pop()!,payload:body.payload};return Promise.reject(new Error('lost'));});
 const current=mount();await waitFor(()=>expect((screen.getByText('新增私人草稿') as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('新增私人草稿'));fireEvent.change(await screen.findByLabelText('草稿名稱'),{target:{value:'保存失回應'}});fireEvent.click(screen.getByText('保存草稿'));fireEvent.click(await screen.findByText('查回保存結果'));await screen.findByText('查回內容與本次草稿完全一致，已確認保存，沒有再次送出。');await waitFor(()=>expect(current.router.state.location.search).toBe('?draft='+stored!.id));const url='/receiving'+current.router.state.location.search;current.unmount();mount(auth(),url);await screen.findByDisplayValue('保存失回應');expect(api.put).toHaveBeenCalledTimes(1);
});
