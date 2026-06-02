import { stringify } from 'csv-stringify/sync';
import { parse } from 'csv-parse/sync';
import { prisma } from '../../lib/prisma';
import { requireTenantId } from '../../lib/tenant.context';

type CsvCell = string | number;
type CsvRow = CsvCell[];
type NumericExportValue = number | string | { toString(): string };

type ProductExportRow = {
  name: string;
  sku: string;
  retailPrice: NumericExportValue;
  costPrice: NumericExportValue;
  stockQuantity: number;
  safetyStock: number | null;
  category: { name: string } | null;
  supplier: { name: string } | null;
};

type OrderExportRow = {
  id: string;
  orderNumber: string | null;
  status: string;
  totalAmount: NumericExportValue;
  paymentMethod: string | null;
  customer: { name: string | null } | null;
  salesStaff: { fullName: string } | null;
  createdAt: Date;
};

type CustomerExportRow = {
  name: string | null;
  phone: string | null;
  totalSpent: number;
  purchaseCount: number;
  createdAt: Date;
};

type ParsedProductImport = {
  name: string;
  sku: string;
  retailPrice: number;
  costPrice: number;
  stockQuantity: number;
  safetyStock?: number;
};

const PRODUCT_EXPORT_COLUMNS = [
  '商品名稱',
  'SKU',
  '售價',
  '成本',
  '庫存',
  '安全庫存天數',
  '分類',
  '供應商',
];
const ORDER_EXPORT_COLUMNS = [
  '訂單編號',
  '狀態',
  '總金額',
  '付款方式',
  '客戶',
  '銷售人員',
  '建立日期',
];
const CUSTOMER_EXPORT_COLUMNS = ['姓名', '電話', '累計消費', '購買次數', '加入日期'];

function toCsvNumber(value: NumericExportValue): number {
  return Number(value.toString());
}

function toProductCsvRow(product: ProductExportRow): CsvRow {
  return [
    product.name,
    product.sku,
    toCsvNumber(product.retailPrice),
    toCsvNumber(product.costPrice),
    product.stockQuantity,
    product.safetyStock ?? '',
    product.category?.name ?? '',
    product.supplier?.name ?? '',
  ];
}

function toOrderCsvRow(order: OrderExportRow): CsvRow {
  return [
    order.orderNumber ?? order.id.slice(0, 8),
    order.status,
    toCsvNumber(order.totalAmount),
    order.paymentMethod ?? '',
    order.customer?.name ?? '',
    order.salesStaff?.fullName ?? '',
    order.createdAt.toISOString().slice(0, 10),
  ];
}

function toCustomerCsvRow(customer: CustomerExportRow): CsvRow {
  return [
    customer.name ?? '',
    customer.phone ?? '',
    customer.totalSpent ?? 0,
    customer.purchaseCount ?? 0,
    customer.createdAt.toISOString().slice(0, 10),
  ];
}

export class CsvService {
  static async exportProducts(): Promise<string> {
    const tenantId = requireTenantId();
    const products = await prisma.product.findMany({
      where: { tenantId },
      include: { category: true, supplier: true },
      orderBy: { name: 'asc' },
    });

    const rows = products.map(toProductCsvRow);

    return stringify(rows, {
      header: true,
      columns: PRODUCT_EXPORT_COLUMNS,
    });
  }

  static async exportOrders(startDate?: Date, endDate?: Date): Promise<string> {
    const tenantId = requireTenantId();
    const orders = await prisma.order.findMany({
      where: {
        tenantId,
        ...(startDate && endDate ? { createdAt: { gte: startDate, lte: endDate } } : {}),
      },
      include: { customer: true, salesStaff: true },
      orderBy: { createdAt: 'desc' },
    });

    const rows = orders.map(toOrderCsvRow);

    return stringify(rows, {
      header: true,
      columns: ORDER_EXPORT_COLUMNS,
    });
  }

  static async exportCustomers(): Promise<string> {
    const tenantId = requireTenantId();
    const customers = await prisma.customer.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });

    const rows = customers.map(toCustomerCsvRow);

    return stringify(rows, {
      header: true,
      columns: CUSTOMER_EXPORT_COLUMNS,
    });
  }

  static async parseProductImportCsv(csvContent: string): Promise<{
    valid: ParsedProductImport[];
    errors: string[];
  }> {
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    const valid: ParsedProductImport[] = [];
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
        safetyStock: row['安全庫存天數'] ? parseInt(row['安全庫存天數'], 10) : undefined,
      });
    }

    return { valid, errors };
  }
}
