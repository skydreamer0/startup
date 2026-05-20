import { stringify } from 'csv-stringify/sync';
import { parse } from 'csv-parse/sync';
import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';

export class CsvService {
  static async exportProducts(): Promise<string> {
    const tenantId = requireTenantId();
    const products = await prisma.product.findMany({
      where: { tenantId, deletedAt: null },
      include: { category: true, supplier: true },
      orderBy: { name: 'asc' },
    });

    const rows = products.map((p) => [
      p.name,
      p.sku,
      p.retailPrice,
      p.costPrice,
      p.stockQuantity,
      p.safetyStockDays ?? '',
      p.status,
      (p as any).category?.name ?? '',
      (p as any).supplier?.name ?? '',
    ]);

    return stringify(rows, {
      header: true,
      columns: ['商品名稱', 'SKU', '售價', '成本', '庫存', '安全庫存天數', '狀態', '分類', '供應商'],
    });
  }

  static async exportOrders(startDate?: Date, endDate?: Date): Promise<string> {
    const tenantId = requireTenantId();
    const orders = await prisma.order.findMany({
      where: {
        tenantId,
        ...(startDate && endDate ? { createdAt: { gte: startDate, lte: endDate } } : {}),
      },
      include: { customer: true, salesPerson: true },
      orderBy: { createdAt: 'desc' },
    });

    const rows = orders.map((o) => [
      (o as any).orderNumber ?? o.id.slice(0, 8),
      o.status,
      o.totalAmount,
      (o as any).paymentMethod ?? '',
      (o as any).customer?.fullName ?? '',
      (o as any).salesPerson?.fullName ?? '',
      o.createdAt.toISOString().slice(0, 10),
    ]);

    return stringify(rows, {
      header: true,
      columns: ['訂單編號', '狀態', '總金額', '付款方式', '客戶', '銷售人員', '建立日期'],
    });
  }

  static async exportCustomers(): Promise<string> {
    const tenantId = requireTenantId();
    const customers = await prisma.customer.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const rows = customers.map((c) => [
      c.fullName,
      (c as any).phone ?? '',
      c.email ?? '',
      (c as any).totalSpent ?? 0,
      (c as any).purchaseCount ?? 0,
      c.createdAt.toISOString().slice(0, 10),
    ]);

    return stringify(rows, {
      header: true,
      columns: ['姓名', '電話', 'Email', '累計消費', '購買次數', '加入日期'],
    });
  }

  static async parseProductImportCsv(csvContent: string): Promise<{
    valid: Array<{
      name: string;
      sku: string;
      retailPrice: number;
      costPrice: number;
      stockQuantity: number;
      safetyStockDays?: number;
    }>;
    errors: string[];
  }> {
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    });

    const valid: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const rowNum = i + 2;

      if (!row['商品名稱']?.trim()) {
        errors.push(`第 ${rowNum} 行：商品名稱 必填`);
        continue;
      }
      if (!row['SKU']?.trim()) {
        errors.push(`第 ${rowNum} 行：SKU 必填`);
        continue;
      }
      const retailPrice = parseFloat(row['售價']);
      const costPrice = parseFloat(row['成本']);
      const stockQuantity = parseInt(row['庫存'], 10);

      if (isNaN(retailPrice) || retailPrice < 0) {
        errors.push(`第 ${rowNum} 行：售價 必須為非負數字`);
        continue;
      }
      if (isNaN(costPrice) || costPrice < 0) {
        errors.push(`第 ${rowNum} 行：成本 必須為非負數字`);
        continue;
      }
      if (isNaN(stockQuantity) || stockQuantity < 0) {
        errors.push(`第 ${rowNum} 行：庫存 必須為非負整數`);
        continue;
      }

      valid.push({
        name: row['商品名稱'].trim(),
        sku: row['SKU'].trim(),
        retailPrice,
        costPrice,
        stockQuantity,
        safetyStockDays: row['安全庫存天數']
          ? parseInt(row['安全庫存天數'], 10)
          : undefined,
      });
    }

    return { valid, errors };
  }
}
