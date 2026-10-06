import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { tenantPersistence } from '../../lib/tenant-persistence';
import { AppError } from '../../lib/errors';
import { checkoutSchema, type CheckoutDto } from './pos.schema';

export const CHECKOUT_COMMAND_KIND = 'POS_CHECKOUT';

// An explicit allowlist keeps credentials and transport metadata out of the hash.
// Line/payment order is significant; defaults match HTTP validation and direct calls.
export function checkoutPayloadHash(dto: CheckoutDto): string {
  const businessPayload = {
    version: 1,
    shiftId: dto.shiftId.toLowerCase(),
    customerId: dto.customerId?.toLowerCase() ?? null,
    salesStaffId: dto.salesStaffId?.toLowerCase() ?? null,
    cartItems: dto.cartItems.map((item) => ({
      productId: item.productId.toLowerCase(), quantity: item.quantity, discountRate: item.discountRate ?? 0,
    })),
    paymentMethod: dto.paymentMethod,
    payments: dto.payments?.length ? dto.payments.map(({ method, amount }) => ({ method, amount })) : [],
    orderDiscountAmount: dto.orderDiscountAmount ?? 0,
    orderDiscountNote: dto.orderDiscountNote ?? '',
  };
  return createHash('sha256').update(JSON.stringify(businessPayload)).digest('hex');
}

type JsonResult<T> = T extends Date | Prisma.Decimal ? string
  : T extends (infer U)[] ? JsonResult<U>[]
  : T extends object ? { [K in keyof T]: JsonResult<T[K]> } : T;

type CheckoutTransaction = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

export class CheckoutCommandService {
  static async execute<T extends { id: string }>(input: CheckoutDto, post: (tx: CheckoutTransaction, dto: CheckoutDto) => Promise<T>): Promise<JsonResult<T>> {
    const tenant = tenantPersistence();
    const parsed = checkoutSchema.body.safeParse(input);
    if (!parsed.success) throw new AppError(400, 'Invalid checkout command', 'VALIDATION_FAILED');
    const dto = parsed.data;
    const payloadHash = checkoutPayloadHash(dto);
    const key = tenant.where({ kind: CHECKOUT_COMMAND_KIND, commandId: dto.commandId });

    return prisma.$transaction(async (tx) => {
      // INSERT ON CONFLICT DO NOTHING waits for an in-flight owner of this key.
      // A subsequent Read Committed read sees its committed result; no unique
      // violation is caught inside an already-aborted PostgreSQL transaction.
      const claim = await tx.checkoutCommand.createMany({
        data: tenant.data({ kind: CHECKOUT_COMMAND_KIND, commandId: dto.commandId, payloadHash }),
        skipDuplicates: true,
      });
      if (claim.count === 0) {
        const existing = await tx.checkoutCommand.findFirstOrThrow({ where: key });
        if (existing.payloadHash !== payloadHash) throw new AppError(409, 'commandId already belongs to a different checkout payload', 'COMMAND_PAYLOAD_CONFLICT');
        if (existing.status !== 'SUCCEEDED' || !existing.result) throw new AppError(503, 'Checkout result is unknown; query or resend the same command', 'COMMAND_UNKNOWN');
        return existing.result as JsonResult<T>;
      }

      const order = await post(tx, dto);
      // The first response and every replay use the same JSON wire snapshot.
      const result = JSON.parse(JSON.stringify(order)) as Prisma.InputJsonObject;
      const completed = await tx.checkoutCommand.updateMany({ where: { ...key, status: 'PENDING' }, data: {
        status: 'SUCCEEDED', orderId: order.id, result, completedAt: new Date(),
      } });
      if (completed.count !== 1) throw new AppError(500, 'Checkout command completion failed');
      return result as JsonResult<T>;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  }

  static async getResult(commandId: string) {
    const tenant = tenantPersistence();
    const command = await prisma.checkoutCommand.findFirst({
      where: tenant.where({ kind: CHECKOUT_COMMAND_KIND, commandId: commandId.toLowerCase() }),
    });
    if (!command || command.status !== 'SUCCEEDED') return { commandId, status: 'UNKNOWN' as const };
    return { commandId: command.commandId, status: 'SUCCEEDED' as const, result: command.result };
  }
}
