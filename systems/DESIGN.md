---
version: 1.0
name: PharmaSaaS Design System
description: >
  A Stripe-inspired design language adapted for a multi-tenant pharmacy SaaS platform.
  Built on deep navy ink, electric indigo CTAs, and a two-surface system that powers
  both a data-dense Admin SPA (老闆管理後台) and a touch-first POS PWA (收銀終端).
  Financial-grade tabular figures for all prices and quantities. Pill buttons optimized
  for both mouse and touch. Light-mode POS for bright retail environments; dark-shell
  Admin for focused data work.

apps:
  admin: Admin SPA — 老闆 / 管理員使用，深色系 dashboard
  pos:   POS PWA  — 店員收銀使用，淺色系觸控介面

colors:
  # Brand
  primary:          "#533afd"
  primary-hover:    "#665efd"
  primary-press:    "#2e2b8c"
  primary-soft:     "#e0deff"
  # Ink (text)
  ink:              "#0d253d"
  ink-secondary:    "#273951"
  ink-muted:        "#64748d"
  ink-disabled:     "#a8b4c8"
  on-primary:       "#ffffff"
  # Light surfaces (POS + Admin cards)
  canvas:           "#ffffff"
  canvas-soft:      "#f6f9fc"
  canvas-muted:     "#eef2f7"
  # Dark surfaces (Admin shell)
  dark-900:         "#0d1117"
  dark-800:         "#161b22"
  dark-700:         "#1c2230"
  dark-border:      "#2a3347"
  # Semantic
  success:          "#0e9f6e"
  success-soft:     "#d1fae5"
  warning:          "#d97706"
  warning-soft:     "#fef3c7"
  danger:           "#e02424"
  danger-soft:      "#fde8e8"
  info:             "#1c64f2"
  info-soft:        "#ebf5ff"
  # Borders & dividers
  hairline:         "#e3e8ee"
  hairline-dark:    "#2a3347"

typography:
  # Display — Admin hero sections & POS category headers
  display-lg:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: -0.64px
  display-md:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: -0.48px
  # Headings
  heading-lg:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: -0.2px
  heading-md:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: -0.1px
  heading-sm:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: 0
  # Body
  body-lg:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-md:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: 0
  body-sm:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0
  # Financial — ALL prices and quantities must use this
  price-xl:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 28px
    fontWeight: 700
    lineHeight: 1.1
    letterSpacing: -0.56px
    fontFeature: tnum
  price-lg:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: -0.4px
    fontFeature: tnum
  price-md:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 15px
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: -0.3px
    fontFeature: tnum
  tabular:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: -0.26px
    fontFeature: tnum
  # Buttons
  button-lg:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 16px
    fontWeight: 500
    lineHeight: 1.0
    letterSpacing: 0
  button-md:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.0
    letterSpacing: 0
  # Labels & captions
  label:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 1.3
    letterSpacing: 0.2px
  caption:
    fontFamily: "Inter, 'SF Pro Display', system-ui, sans-serif"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0

rounded:
  xs:   4px
  sm:   6px
  md:   8px
  lg:   12px
  xl:   16px
  xxl:  24px
  pill: 9999px

spacing:
  xxs: 2px
  xs:  4px
  sm:  8px
  md:  12px
  lg:  16px
  xl:  24px
  xxl: 32px
  section: 48px

# ─── Admin SPA Components ────────────────────────────────────────
admin-components:
  # Shell
  sidebar:
    backgroundColor: "{colors.dark-800}"
    borderRight: "1px solid {colors.dark-border}"
    width: 240px
    itemTextColor: "{colors.ink-muted}"
    itemActiveBackground: "{colors.dark-700}"
    itemActiveTextColor: "{colors.on-primary}"
    itemHoverBackground: "{colors.dark-700}"
    typography: "{typography.body-md}"

  topbar:
    backgroundColor: "{colors.dark-900}"
    borderBottom: "1px solid {colors.dark-border}"
    height: 56px
    textColor: "{colors.on-primary}"
    typography: "{typography.body-md}"

  main-canvas:
    backgroundColor: "{colors.dark-900}"
    textColor: "{colors.on-primary}"
    padding: 24px 32px

  # Cards
  stat-card:
    backgroundColor: "{colors.dark-800}"
    border: "1px solid {colors.dark-border}"
    rounded: "{rounded.lg}"
    padding: 20px 24px
    labelTypography: "{typography.label}"
    labelColor: "{colors.ink-muted}"
    valueTypography: "{typography.price-lg}"
    valueColor: "{colors.on-primary}"

  data-card:
    backgroundColor: "{colors.dark-800}"
    border: "1px solid {colors.dark-border}"
    rounded: "{rounded.lg}"
    padding: 24px
    headerTypography: "{typography.heading-md}"
    headerColor: "{colors.on-primary}"
    bodyTypography: "{typography.body-md}"
    bodyColor: "{colors.ink-muted}"

  # Tables
  table:
    backgroundColor: "{colors.dark-800}"
    border: "1px solid {colors.dark-border}"
    rounded: "{rounded.lg}"
    headerBackground: "{colors.dark-700}"
    headerTextColor: "{colors.ink-muted}"
    headerTypography: "{typography.label}"
    rowTextColor: "{colors.on-primary}"
    rowTypography: "{typography.tabular}"
    rowHoverBackground: "{colors.dark-700}"
    rowBorder: "1px solid {colors.dark-border}"
    numericTypography: "{typography.tabular}"

  # Buttons (Admin)
  btn-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 8px 16px
    hoverBackground: "{colors.primary-hover}"
    pressBackground: "{colors.primary-press}"

  btn-secondary:
    backgroundColor: "transparent"
    border: "1px solid {colors.dark-border}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 8px 16px

  btn-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.button-md}"
    rounded: "{rounded.md}"
    padding: 8px 12px

  btn-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 8px 16px

  # Badges & Tags
  badge-success:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: 2px 8px

  badge-warning:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: 2px 8px

  badge-danger:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: 2px 8px

  badge-info:
    backgroundColor: "{colors.info-soft}"
    textColor: "{colors.info}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: 2px 8px

  # Forms
  input:
    backgroundColor: "{colors.dark-700}"
    border: "1px solid {colors.dark-border}"
    textColor: "{colors.on-primary}"
    placeholderColor: "{colors.ink-muted}"
    typography: "{typography.body-md}"
    rounded: "{rounded.md}"
    padding: 10px 12px
    focusBorder: "1px solid {colors.primary}"
    height: 40px

  # Plan tier chip (SaaS)
  plan-chip-free:
    backgroundColor: "{colors.canvas-muted}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: 3px 10px

  plan-chip-pro:
    backgroundColor: "{colors.primary-soft}"
    textColor: "{colors.primary-press}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: 3px 10px

# ─── POS PWA Components ──────────────────────────────────────────
pos-components:
  # Shell
  pos-topbar:
    backgroundColor: "{colors.canvas}"
    borderBottom: "1px solid {colors.hairline}"
    height: 60px
    textColor: "{colors.ink}"
    typography: "{typography.heading-md}"

  pos-main:
    backgroundColor: "{colors.canvas-soft}"
    padding: 16px

  # Product grid (左側商品選擇)
  product-tile:
    backgroundColor: "{colors.canvas}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.lg}"
    padding: 16px 12px
    minHeight: 100px
    nameTypography: "{typography.body-md}"
    nameColor: "{colors.ink}"
    priceTypography: "{typography.price-md}"
    priceColor: "{colors.primary}"
    hoverBorder: "1px solid {colors.primary}"
    hoverShadow: "0 0 0 2px {colors.primary-soft}"

  product-tile-out-of-stock:
    backgroundColor: "{colors.canvas-muted}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.lg}"
    padding: 16px 12px
    opacity: 0.5
    nameColor: "{colors.ink-disabled}"
    priceColor: "{colors.ink-disabled}"

  # Category tabs (商品分類)
  category-tab:
    backgroundColor: "transparent"
    textColor: "{colors.ink-muted}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 8px 16px
    height: 40px

  category-tab-active:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-md}"
    rounded: "{rounded.pill}"
    padding: 8px 16px
    height: 40px

  # Cart panel (右側購物車)
  cart-panel:
    backgroundColor: "{colors.canvas}"
    borderLeft: "1px solid {colors.hairline}"
    width: 360px
    padding: 0

  cart-item-row:
    backgroundColor: "{colors.canvas}"
    borderBottom: "1px solid {colors.hairline}"
    padding: 12px 16px
    nameTypography: "{typography.body-md}"
    nameColor: "{colors.ink}"
    priceTypography: "{typography.price-md}"
    priceColor: "{colors.ink}"
    qtyTypography: "{typography.heading-md}"
    qtyColor: "{colors.ink}"

  cart-total-bar:
    backgroundColor: "{colors.canvas-soft}"
    borderTop: "1px solid {colors.hairline}"
    padding: 16px
    labelTypography: "{typography.body-md}"
    labelColor: "{colors.ink-muted}"
    totalTypography: "{typography.price-xl}"
    totalColor: "{colors.ink}"

  # POS Action Buttons — MUST be touch-friendly (min 48px height)
  pos-btn-checkout:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.xl}"
    padding: 16px 24px
    minHeight: 56px
    width: "100%"
    hoverBackground: "{colors.primary-hover}"
    pressBackground: "{colors.primary-press}"

  pos-btn-cancel:
    backgroundColor: "{colors.danger-soft}"
    textColor: "{colors.danger}"
    typography: "{typography.button-lg}"
    rounded: "{rounded.xl}"
    padding: 16px 24px
    minHeight: 56px

  pos-btn-discount:
    backgroundColor: "{colors.warning-soft}"
    textColor: "{colors.warning}"
    typography: "{typography.button-md}"
    rounded: "{rounded.lg}"
    padding: 12px 20px
    minHeight: 48px

  # Qty stepper (+/- buttons on cart)
  qty-stepper-btn:
    backgroundColor: "{colors.canvas-muted}"
    textColor: "{colors.ink}"
    typography: "{typography.heading-md}"
    rounded: "{rounded.md}"
    size: 36px

  # Payment method selector
  payment-option:
    backgroundColor: "{colors.canvas}"
    border: "1px solid {colors.hairline}"
    rounded: "{rounded.lg}"
    padding: 14px 16px
    textColor: "{colors.ink}"
    typography: "{typography.body-lg}"
    minHeight: 56px

  payment-option-selected:
    backgroundColor: "{colors.primary-soft}"
    border: "2px solid {colors.primary}"
    rounded: "{rounded.lg}"
    padding: 14px 16px
    textColor: "{colors.primary-press}"
    typography: "{typography.body-lg}"
    fontWeight: 600
    minHeight: 56px

  # Receipt / order confirm modal
  receipt-card:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.xl}"
    padding: 24px
    totalTypography: "{typography.price-xl}"
    totalColor: "{colors.ink}"
    lineItemTypography: "{typography.tabular}"
    lineItemColor: "{colors.ink-secondary}"
---

## Overview

PharmaSaaS 採用 Stripe 設計語言為基礎，分成兩個獨立 surface：

1. **Admin SPA（管理後台）** — 深色 shell（`{colors.dark-900}`），sidebar 導航，資料密集的 dashboard。
   針對老闆、藥師、倉管在桌機上長時間使用設計。

2. **POS PWA（收銀終端）** — 淺色 canvas（`{colors.canvas-soft}`），無 sidebar，左右分割佈局
   （商品網格左、購物車右）。針對店員在平板/觸控螢幕快速操作設計。

兩個 app 共用同一套 token（顏色、字體、圓角、間距）。

## 核心設計原則

### 1. 金融精準數字排版
藥局業務核心是金錢與庫存數字。**所有價格、數量、金額欄位必須使用 `font-feature-settings: "tnum"` 等寬數字**，避免數字對齊跳動。

```css
/* 正確 */
.price { font-variant-numeric: tabular-nums; }
/* 或 */
.price { font-feature-settings: "tnum"; }
```

使用 `{typography.price-xl}` / `{typography.price-lg}` / `{typography.price-md}` / `{typography.tabular}` 四個等寬 token。

### 2. 觸控優先（POS）
POS 所有可點擊元素最小尺寸：
- 主要 CTA（結帳）：`minHeight: 56px`
- 一般按鈕：`minHeight: 48px`
- 數量調整鈕：`36×36px`
- 商品 tile：`minHeight: 100px`

不允許使用小於 36px 的可點擊元素在 POS 介面上。

### 3. Indigo 為唯一主色 CTA
`{colors.primary}` (#533afd) 只用於：
- 主要 CTA 按鈕（結帳、儲存、確認）
- 連結文字強調
- 選中狀態邊框
- 導航 active 狀態

絕對不用 indigo 填充背景段落、卡片底色、表格背景。

### 4. 語義色板
| 用途 | 顏色 | 背景 |
|---|---|---|
| 成功 / 已付款 / 庫存充足 | `{colors.success}` | `{colors.success-soft}` |
| 警告 / 低庫存 / 即將到期 | `{colors.warning}` | `{colors.warning-soft}` |
| 危險 / 退款 / 缺貨 | `{colors.danger}` | `{colors.danger-soft}` |
| 資訊 / 待處理 | `{colors.info}` | `{colors.info-soft}` |

## Colors

### Brand & Accent
- **Indigo** (`{colors.primary}` — `#533afd`): 唯一主色 CTA、選中狀態、連結。
- **Indigo Hover** (`{colors.primary-hover}` — `#665efd`): hover state。
- **Indigo Press** (`{colors.primary-press}` — `#2e2b8c`): pressed state。
- **Indigo Soft** (`{colors.primary-soft}` — `#e0deff`): 選中背景、soft badge。

### Light Surface (POS)
- **Canvas** (`{colors.canvas}` — `#ffffff`): 卡片、購物車面板、彈窗。
- **Canvas Soft** (`{colors.canvas-soft}` — `#f6f9fc`): POS 主背景。
- **Canvas Muted** (`{colors.canvas-muted}` — `#eef2f7`): 禁用狀態、分隔帶。
- **Hairline** (`{colors.hairline}` — `#e3e8ee`): 1px 分隔線。

### Dark Surface (Admin)
- **Dark 900** (`{colors.dark-900}` — `#0d1117`): Admin 主背景。
- **Dark 800** (`{colors.dark-800}` — `#161b22`): Sidebar、卡片底色。
- **Dark 700** (`{colors.dark-700}` — `#1c2230`): hover 狀態、表格 header。
- **Dark Border** (`{colors.dark-border}` — `#2a3347`): 深色介面分隔線。

### Text
- **Ink** (`{colors.ink}` — `#0d253d`): POS 主文字、Admin 白色文字用 `{colors.on-primary}`。
- **Ink Secondary** (`{colors.ink-secondary}` — `#273951`): 次要描述文字。
- **Ink Muted** (`{colors.ink-muted}` — `#64748d`): label、placeholder、說明文字。

## Typography

### 字體選擇
**Inter**（Google Fonts，免費開源）是本系統的標準字體。它是 Stripe 使用的 Sohne 最接近的開源替代品，具備：
- 優秀的 `tnum`（tabular numerals）支援，數字對齊完美
- 中文顯示 fallback 至系統字體 `'PingFang TC', 'Microsoft JhengHei'`
- 全平台 hinting 優良

```css
font-family: 'Inter', 'PingFang TC', 'Microsoft JhengHei', system-ui, sans-serif;
```

### 關鍵原則
- **所有金錢/數量欄位** → `font-feature-settings: "tnum"` 等寬數字
- **顯示大字** → `letter-spacing: -0.64px`（negative tracking，顯示更精煉）
- **按鈕文字** → `font-weight: 500`，非 bold，非 regular
- **中文 label** → 使用 `font-weight: 500` 提升辨識度

## Layout

### Admin SPA 佈局
```
┌──────────┬────────────────────────────────────┐
│ Sidebar  │ Topbar (56px)                       │
│ (240px)  ├────────────────────────────────────┤
│          │ Main Content                        │
│          │ padding: 24px 32px                  │
│          │                                     │
│          │ [Stat Cards: 4-col grid]            │
│          │ [Data Cards / Tables]               │
└──────────┴────────────────────────────────────┘
```
- Sidebar 寬 240px，固定，深色 `{colors.dark-800}`
- Content 區 max-width: 1440px
- Stat card grid: 4-up → 2-up（tablet）→ 1-up（mobile）

### POS PWA 佈局
```
┌───────────────────────────────────────┐
│ Topbar: 店名 + 收銀員 + 時間 (60px)   │
├──────────────────────┬────────────────┤
│ 商品區（左，flex-1） │ 購物車（右）   │
│                      │  width: 360px  │
│ [Category Tabs]      │                │
│ [Product Grid]       │ [Cart Items]   │
│ 3-col → 2-col        │                │
│                      │ [Total Bar]    │
│                      │ [結帳按鈕]     │
└──────────────────────┴────────────────┘
```
- 全螢幕，無 sidebar
- 購物車固定 360px，不 scroll
- 商品區獨立 scroll
- 平板（768px 以下）：購物車收至底部 sheet

### 間距系統
- 基本單位：4px
- 卡片內部：`{spacing.xl}` 24px
- 區塊間距：`{spacing.section}` 48px
- POS tile padding：`{spacing.lg}` 16px

## Elevation & Shadow

| Level | 處理方式 | 使用場景 |
|---|---|---|
| 0 flat | 無陰影 | 一般文字、表格列 |
| 1 card | `box-shadow: 0 1px 3px rgba(13,37,61,0.08)` | Admin 卡片、POS 商品 tile |
| 2 float | `box-shadow: 0 4px 16px rgba(13,37,61,0.10), 0 1px 4px rgba(13,37,61,0.06)` | Modal、Dropdown、購物車面板 |
| 3 modal | `box-shadow: 0 20px 60px rgba(13,37,61,0.20)` | 收據彈窗、確認對話框 |

## Shapes

| Token | 值 | 使用 |
|---|---|---|
| `{rounded.xs}` | 4px | 小 badge、tag |
| `{rounded.sm}` | 6px | Input 欄位 |
| `{rounded.md}` | 8px | 一般按鈕（Admin ghost btn）|
| `{rounded.lg}` | 12px | 卡片、POS product tile |
| `{rounded.xl}` | 16px | POS 大卡片、modal |
| `{rounded.xxl}` | 24px | 收據卡片 |
| `{rounded.pill}` | 9999px | 主要 CTA 按鈕、badge、category tab |

## Components

### Admin: Stat Card
```
┌─────────────────────────────┐
│ 本月營收           [↑ 12%]  │   ← label + trend badge
│ NT$ 284,500                 │   ← price-lg, tnum
│ vs 上月 NT$ 253,800         │   ← tabular, ink-muted
└─────────────────────────────┘
```
- 背景：`{colors.dark-800}`，border：`{colors.dark-border}`
- 數字必須使用 `{typography.price-lg}` (tnum)

### POS: Product Tile
```
┌──────────────────┐
│ [商品圖/圖示]    │
│ 深海魚油 120粒   │   ← body-md
│ NT$ 890          │   ← price-md (tnum, indigo)
│ 庫存：48         │   ← caption, ink-muted
└──────────────────┘
```
- 點擊整個 tile 加入購物車
- 缺貨時 opacity: 0.5，禁止點擊
- hover 時顯示 indigo 外框 `{colors.primary-soft}` shadow

### POS: Cart Item Row
```
魚油 Omega-3          NT$ 890
[－] 2 [＋]                × 2 = NT$ 1,780
```
- 商品名：`{typography.body-md}`
- 單價：`{typography.tabular}`（tnum）
- 合計：`{typography.price-md}`（tnum, font-weight: 600）

### POS: Checkout Button
```
┌─────────────────────────────────┐
│         結帳   NT$ 2,670        │   ← button-lg + price-lg (tnum)
└─────────────────────────────────┘
```
- 高度 56px，圓角 `{rounded.xl}`，indigo 填色
- 金額與「結帳」文字並排，金額使用 tnum

## Do's and Don'ts

### Do
- 所有價格、數量、金額 → 必須使用 tnum 等寬數字 token
- POS 所有可點擊元素 → minHeight ≥ 48px（主 CTA ≥ 56px）
- indigo 只用於主要 CTA、選中狀態、連結文字
- Admin 數字用白色 (`{colors.on-primary}`)，POS 數字用深藍 (`{colors.ink}`)
- 語義色用 soft 背景版本搭配深色文字（badge 模式）

### Don't
- 不用 indigo 填充背景色塊、卡片底色
- 不在 POS 頁面使用 sidebar 或 drawer 導航
- 不用純黑 `#000000`——文字用 `{colors.ink}` (#0d253d)
- 不在 Admin 資料表中使用 weight 700+（tabular 數字 weight 400-500 足夠）
- 不混用多個有色背景卡片——同一頁面最多一個語義色 highlight

## Responsive Behavior

### Admin SPA
| 斷點 | Sidebar | Grid |
|---|---|---|
| ≥ 1280px | 固定 240px | 4-col stat card |
| 1024–1279px | 固定 240px | 2-col stat card |
| 768–1023px | 收合至 icon-only 64px | 2-col |
| < 768px | 底部 tab bar | 1-col |

### POS PWA
| 斷點 | 佈局 |
|---|---|
| ≥ 1024px（桌機/大平板橫置）| 左右分割，購物車 360px |
| 768–1023px（平板橫置）| 左右分割，購物車 320px |
| < 768px（平板直立/手機）| 商品全寬，購物車收至底部 sheet（height: 50vh） |

### Touch Targets（POS 必守）
- 主 CTA 按鈕：44×56px 最小
- 商品 tile：100px 高最小，寬隨 grid 自動
- 數量加減鈕：36×36px 最小（外層 touch area padding 6px）
- 分類 tab：40px 高最小

## Iteration Guide

1. 新增元件時先確認在 Admin 還是 POS context，挑對 surface token。
2. 任何含數字/金額的欄位——先加 `font-feature-settings: "tnum"`，再想其他樣式。
3. 按鈕顏色規則：主要動作 indigo pill → 次要動作 outline pill → 危險動作 danger soft。
4. POS 新增可點擊元素時，先在手機模擬器測試觸控大小，再切換桌機。
5. 新增 Admin 卡片時，背景 `{colors.dark-800}` + border `{colors.dark-border}`，不使用陰影（dark 介面用 border 做層次）。
