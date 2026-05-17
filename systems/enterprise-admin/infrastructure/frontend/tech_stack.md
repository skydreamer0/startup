# 前端技術棧與全域狀態管理規範

## 概覽

本專案包含兩個獨立的前端 SPA，分別服務不同使用情境：

| 應用 | 路徑 | 開發 Port | 用途 |
|------|------|-----------|------|
| admin-ui | `systems/enterprise-admin/admin-ui/` | 5173 | 後台管理系統 |
| pos-ui | `systems/enterprise-admin/pos-ui/` | 5174 | 收銀 / POS 操作台 |

---

## admin-ui 技術棧

### 核心套件

| 套件 | 版本 | 用途 |
|------|------|------|
| React | ^19.2.4 | UI 框架 |
| TypeScript | ^5.9.3 | 型別安全 |
| Vite | ^6.4.1 | 建置工具，開發 port 5173 |
| React Router DOM | ^6.30.3 | 客戶端路由 |
| TanStack Query (React Query) | ^5.90.21 | 伺服器狀態管理 |
| Axios | ^1.13.5 | HTTP 客戶端 |
| Recharts | ^3.7.0 | 圖表元件 |

### 測試工具

| 套件 | 用途 |
|------|------|
| Vitest | 單元測試執行器 |
| @testing-library/react | React 元件測試 |
| @testing-library/jest-dom | DOM 斷言擴充 |

**注意：** admin-ui 目前**沒有安裝 Zustand**。全域 App 狀態目前透過 React Context（`AuthProvider`）管理，如有需要才引入 Zustand。

---

## pos-ui 技術棧

### 核心套件

| 套件 | 版本 | 用途 |
|------|------|------|
| React | ^19.2.4 | UI 框架 |
| TypeScript | ^5.9.3 | 型別安全 |
| Vite | ^6.4.1 | 建置工具，開發 port 5174 |
| React Router DOM | ^6.30.3 | 客戶端路由 |
| Zustand | ^5.0.3 | 購物車全域狀態 |
| Axios | ^1.7.0 | HTTP 客戶端 |

**注意：** pos-ui **沒有安裝 TanStack Query**。資料獲取以直接呼叫 axios + `useState/useEffect` 為主，因 POS 的操作流程較線性，不需要 Query Cache。

---

## API Client 使用方式

### admin-ui（`src/api/client.ts`）

```ts
import api from '../api/client';
```

- `baseURL` 為 `/api/v1/admin`
- **Request interceptor**：自動從 `localStorage.getItem('accessToken')` 注入 `Authorization: Bearer <token>`，無需每次手動設定 header
- **Response interceptor**：攔截 401 錯誤，自動用 `refreshToken` 換新 token 並重試原請求；若換 token 失敗則清除 `localStorage` 並導向 `/login`

```ts
// 範例：直接呼叫，不需帶 token
const res = await api.get('/inventory/products');
const res = await api.post('/orders', payload);
```

### pos-ui（`src/api/client.ts`）

- `baseURL` 為 `/api/v1/pos`
- Token 儲存 key：`pos_accessToken`（與 admin-ui 的 `accessToken` **刻意分開**，互不干擾）
- 401 時清除 `pos_accessToken` 並導向 `/login`

---

## 狀態管理規範

### 三層狀態分工

| 層次 | 工具 | 適用對象 |
|------|------|---------|
| 伺服器狀態（Server state） | TanStack Query（admin-ui） | API 資料、清單、分頁、快取 |
| 本地 UI 狀態（Local UI state） | `useState` | 表單欄位、展開/收合、Modal 開關 |
| 全域 App 狀態（Global state） | Zustand（pos-ui）/ React Context（admin-ui AuthProvider） | 購物車、登入使用者資訊 |

### 資料獲取強制規範（admin-ui）

**必須使用 TanStack Query 進行所有 API 資料獲取。**

```ts
// 正確：useQuery 讀取清單
const { data, isLoading } = useQuery({
  queryKey: ['products'],
  queryFn: () => api.get('/inventory/products').then(r => r.data.data),
});

// 正確：useMutation 執行寫入
const mutation = useMutation({
  mutationFn: (payload) => api.post('/orders', payload),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['orders'] });
    toast.success('訂單建立成功');
  },
});
```

**禁止以下寫法（admin-ui 中）：**

```ts
// 錯誤：直接用 useState + useEffect + fetch/axios 獲取 API 資料
const [data, setData] = useState([]);
useEffect(() => {
  api.get('/products').then(r => setData(r.data.data));
}, []);
```

> 例外：auth 初始化（`useAuth` 內部）因需要在 React Query 掛載前執行，允許使用 `useEffect`。

### 快取失效（Cache Invalidation）

寫入操作完成後，必須用 `queryClient.invalidateQueries` 通知相關 Query 重新獲取：

```ts
queryClient.invalidateQueries({ queryKey: ['dashboard'] });
queryClient.invalidateQueries({ queryKey: ['batches'] });
```

---

## 認證機制

### admin-ui

- Token 儲存：`localStorage.getItem('accessToken')` / `localStorage.getItem('refreshToken')`
- 使用者資訊：透過 `useAuth()` hook 取得（`AuthProvider` context）
- 權限檢查：`useAuth().hasPermission('permission.string')`

### pos-ui

- Token 儲存：`localStorage.getItem('pos_accessToken')`（無 refresh token 機制）
- 登出：清除 `pos_accessToken` 並導向 `/login`
