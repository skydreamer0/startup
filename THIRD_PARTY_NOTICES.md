# 授權範圍與第三方聲明

## PharmaSaaS 自有程式碼

根目錄 [ISC LICENSE](LICENSE) 適用於本專案有權授權的自有程式碼，不取代第三方原有條款，也不擴張到以下排除事項。若檔案有獨立授權或著作權聲明，依其聲明；無法判定來源或權利的素材，不因位於此儲存庫而取得授權。ISC 不代表任何可投入實店營運或其他適用性保證。

- **品牌另計。** PharmaSaaS 的名稱、標誌、「流轉膠囊」圖樣與套件，包括 [品牌來源與預覽](systems/enterprise-admin/infrastructure/design-system/brand/) 及 Admin/POS 的 `public/brand/flow-capsule-v1/`、`src/assets/brand/flow-capsule-v1/`，不在 ISC 授權範圍。不得據此推論有商標、品牌或背書權利。需要對外散布 UI 成品時，另確認品牌使用許可，或用自己有權使用的標誌替換。
- **資料另計。** 此授權不包括真實門市、客戶、供應商、單據、匯出、憑證或硬體廠商材料，也不把公開程式碼變成發布實際營運資料的許可。外部示範/驗收只用合成資料或已驗權利素材；截圖與測試資料按來源個別核對。

## 已核對的第三方元件

| 範圍 | 元件 | 授權證據 |
| --- | --- | --- |
| Admin 主題 | `shadcn@4.8.0` 的原樣 stylesheet | MIT；[原授權](systems/enterprise-admin/admin-ui/src/styles/vendor/shadcn.LICENSE.md)及[來源與雜湊](systems/enterprise-admin/admin-ui/src/styles/vendor/README.md)。 |
| Admin 字體 | `@fontsource-variable/geist@5.3.0` | OFL-1.1；依 [Fontsource](https://fontsource.org/fonts/geist/about) 及 [Geist 上游](https://github.com/vercel/geist-font/blob/main/LICENSE.txt)。 |
| POS 圖片解碼 | `zxing-wasm@3.1.2` | [上游固定版本](https://github.com/Sec-ant/zxing-wasm/tree/v3.1.2#licenses) 列出 MIT wrapper、Apache-2.0 的 ZXing-C++ 與橋接碼，以及 BSD-3-Clause 的 zint。依實際隨成品散布的 reader WASM 與元件確認適用聲明；不能只用 npm 摘要裡的 MIT。 |
| Backend | LINE Messaging API Node.js SDK | [上游 Apache-2.0](https://github.com/line/line-bot-sdk-nodejs/blob/master/LICENSE)；服務本身的條款與 SDK 授權分開。 |
| 開發參考 | Impeccable 靜態參考 | Apache-2.0；保留 [LICENSE](.agents/skills/pharmacy-touch-ui-review/references/impeccable/LICENSE)、[NOTICE 及內含的 MIT 衍生來源](.agents/skills/pharmacy-touch-ui-review/references/impeccable/NOTICE.md)。 |
| 開發參考 | UI UX Pro Max | 保留 [MIT LICENSE](.agents/skills/ui-ux-pro-max/LICENSE) 與 [固定來源記錄](.agents/skills/ui-ux-pro-max/SOURCE.lock.json)；資料裡的第三方字體索引不是那些字體的授權。 |

這份索引不等於完整 SBOM，也不替代原授權文字。版本與安裝邊界以 [相依套件政策](systems/enterprise-admin/infrastructure/standards/dependency_management.md)、[前端 pnpm 鎖檔](systems/enterprise-admin/pnpm-lock.yaml)、[後端 npm 鎖檔](systems/enterprise-admin/backend/package-lock.json) 和 [列印工具測試鎖定版本](systems/enterprise-admin/local-print-agent/requirements-tested.txt) 為準。

## 發行前核對

獨立核對每個交付物實際包含的第三方套件與完整聲明，而非整包掃開發依賴後就宣告完成：

1. 從固定版本產物清點 Admin/POS 的 JS、CSS、字體、WASM，後端 Docker 的 runtime 與 Prisma，以及本機列印工具的 Python 套件和輪檔原生依賴。對 Docker 組件另核對基礎映像與作業系統套件。
2. 按實際套件與相依權利保留著作權、授權全文與上游 NOTICE；生成版本和來源清單。前端容器只複製 `dist`，原始碼的聲明不會自動進映像，需核對最終壓縮包或映像可取得這些文件。
3. 核對所有對外素材、驗收截圖及示範使用資料權利與去識別界線，缺來源不得列為已清除。這份原始碼授權變更不等於已完成發行物稽核或已部署。
