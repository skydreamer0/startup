// Synthetic integration-test worker. No HTTP host, seed or production access.
import { PrismaClient } from '@prisma/client';
import type { CheckoutDto } from '../../modules/pos/pos.schema';

async function main() {
  let input = '';
  for await (const chunk of process.stdin) input += chunk.toString();
  const { tenantId, payload } = JSON.parse(input) as { tenantId: string; payload: CheckoutDto };
  const mode = process.argv[2];
  if (mode === 'crash-before-commit') {
    const client = new PrismaClient().$extends({ query: { checkoutCommand: { async updateMany({ args, query }) {
      const result = await query(args);
      if (result.count !== 1) throw new Error('Expected one precommit command completion');
      if (!process.send) throw new Error('Crash worker requires its owned parent IPC channel');
      // Keep the interactive transaction open until the parent kills this exact child.
      await new Promise<never>((_resolve, reject) => {
        process.send!({ stage: 'before-commit', commandId: payload.commandId }, (error) => {
          if (error) reject(error);
        });
      });
      throw new Error('Precommit crash barrier unexpectedly returned');
    } } } });
    Object.assign(globalThis, { prisma: client });
  }
  const { tenantContext } = await import('../../lib/tenant.context');
  const { CheckoutService } = await import('../../modules/pos/checkout.service');
  const { basePrisma } = await import('../../lib/prisma');
  const result = await tenantContext.run({ tenantId, plan: 'pro' }, () => CheckoutService.checkout(payload));
  if (mode !== 'drop-after-commit') process.stdout.write(`RESULT:${JSON.stringify(result)}\n`);
  await basePrisma.$disconnect();
}
main().catch((err: unknown) => { console.error(err); process.exitCode = 1; });
