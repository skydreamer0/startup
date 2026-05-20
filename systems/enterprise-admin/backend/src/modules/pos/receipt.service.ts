import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { requireTenantId } from '../../lib/tenant.context';

const ESC = '\x1B';
const GS = '\x1D';

const CMD = {
  INIT: `${ESC}@`,
  CENTER: `${ESC}a\x01`,
  LEFT: `${ESC}a\x00`,
  BOLD_ON: `${ESC}E\x01`,
  BOLD_OFF: `${ESC}E\x00`,
  DOUBLE_SIZE: `${ESC}!\x30`,
  NORMAL_SIZE: `${ESC}!\x00`,
  CUT: `${GS}V\x42\x00`,
  FEED: '\n',
};

function center(text: string, width = 42): string {
  const pad = Math.max(0, Math.floor((width - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function leftRight(left: string, right: string, width = 42): string {
  const gap = Math.max(1, width - left.length - right.length);
  return left + ' '.repeat(gap) + right;
}

function divider(char = '-', width = 42): string {
  return char.repeat(width);
}

export class ReceiptService {
  static async generateBuffer(orderId: string): Promise<string> {
    const tenantId = requireTenantId();

    const order = await prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        items: {
          include: { product: { select: { name: true } } },
        },
        salesStaff: { select: { fullName: true } },
        customer: { select: { name: true, phone: true } },
      },
    });

    if (!order) throw new AppError(404, 'Order not found');

    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
    const storeName = tenant?.name ?? '藥局';

    const lines: string[] = [];

    // Header
    lines.push(CMD.INIT);
    lines.push(CMD.CENTER + CMD.DOUBLE_SIZE + CMD.BOLD_ON);
    lines.push(storeName);
    lines.push(CMD.NORMAL_SIZE + CMD.BOLD_OFF);
    lines.push(CMD.FEED);

    const dateStr = new Date(order.createdAt).toLocaleString('zh-TW', {
      timeZone: 'Asia/Taipei',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });

    lines.push(CMD.LEFT);
    lines.push(`訂單：${order.orderNumber ?? order.id.slice(0, 8)}`);
    lines.push(`時間：${dateStr}`);
    if (order.salesStaff) lines.push(`收銀：${order.salesStaff.fullName}`);
    lines.push(divider());

    // Items
    for (const item of order.items) {
      const name = item.product.name.slice(0, 20);
      const discountNote = item.discountRate > 0 ? ` (${item.discountRate}%折)` : '';
      const unitPrice = Number(item.finalUnitPrice ?? item.unitPrice);
      lines.push(`${name}${discountNote}`);
      lines.push(leftRight(`  × ${item.quantity}  @${unitPrice.toFixed(0)}`, `${(unitPrice * item.quantity).toFixed(0)}`));
    }

    lines.push(divider());

    const subtotal = order.items.reduce((s, i) => s + Number(i.finalUnitPrice ?? i.unitPrice) * i.quantity, 0);
    lines.push(leftRight('小計', subtotal.toFixed(0)));

    const discountAmount = Number(order.discountAmount);
    if (discountAmount > 0) {
      lines.push(leftRight(`折扣${order.discountNote ? ` (${order.discountNote})` : ''}`, `-${discountAmount.toFixed(0)}`));
    }

    lines.push(CMD.BOLD_ON + leftRight('合計', `${Number(order.totalAmount).toFixed(0)} 元`) + CMD.BOLD_OFF);
    lines.push(leftRight('付款方式', order.paymentMethod));
    lines.push(divider());

    // Footer
    lines.push(CMD.CENTER);
    lines.push('感謝您的光臨！');
    lines.push(CMD.FEED + CMD.FEED + CMD.FEED);
    lines.push(CMD.CUT);

    const raw = lines.join(CMD.FEED);
    return Buffer.from(raw, 'binary').toString('base64');
  }
}
