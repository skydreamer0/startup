import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';
import { InventoryPostingService } from '../../lib/inventory-posting';
import { requireTenantId } from '../../lib/tenant.context';

export interface CreateOrderDto {
    customerId: string;
    items: {
        productId: string;
        quantity: number;
    }[];
    shippingAddress?: string;
}

export class OrderService {
    /**
     * Create a new order with automatic stock reduction and transaction log
     */
    static async createOrder(data: CreateOrderDto) {
        const tenantId = requireTenantId();
        return await prisma.$transaction(async (tx) => {
            // 1. Validate Customer
            const customer = await tx.customer.findUnique({
                where: { id: data.customerId }
            });
            if (!customer) throw new AppError(404, 'Customer not found');

            let totalOrderAmount = 0;
            const orderItemsData = [];
            const { products, lines } = await InventoryPostingService.debitSale(tx, data.items);

            // 2. Process Items
            for (const [index, item] of data.items.entries()) {
                const product = products.get(item.productId)!;

                const retailPrice = Number(product.retailPrice);
                const itemTotal = retailPrice * item.quantity;
                totalOrderAmount += itemTotal;

                orderItemsData.push({
                    id: lines[index].id,
                    productId: product.id,
                    quantity: item.quantity,
                    unitPrice: retailPrice
                });
            }

            // 3. Create Order
            const order = await tx.order.create({
                data: {
                    tenantId,
                    customerId: data.customerId,
                    totalAmount: totalOrderAmount,
                    shippingAddress: data.shippingAddress,
                    status: 'pending',
                    items: {
                        create: orderItemsData
                    }
                },
                include: { items: true }
            });

            // 4. Log the stock debit in the same transaction.
            await InventoryPostingService.recordSale(tx, order.id, lines, 'Order fulfillment');

            // 5. Update Customer aggregated stats
            await tx.customer.update({
                where: { id: data.customerId },
                data: {
                    totalSpent: { increment: totalOrderAmount },
                    purchaseCount: { increment: 1 },
                    lastPurchaseDate: new Date(),
                    lastInteractionDate: new Date()
                }
            });

            // 6. Log Interaction
            await tx.interaction.create({
                data: {
                    customerId: data.customerId,
                    type: 'SYSTEM_NOTICE',
                    content: `Order created: ${order.id} for $${totalOrderAmount}`,
                    interactedAt: new Date()
                } as Prisma.InteractionUncheckedCreateInput
            });

            return order;
        });
    }

    static async getOrders(filters: { customerId?: string; status?: string }) {
        return await prisma.order.findMany({
            where: {
                customerId: filters.customerId,
                status: filters.status
            },
            include: {
                customer: { select: { name: true, phone: true } },
                _count: { select: { items: true } }
            },
            orderBy: { createdAt: 'desc' }
        });
    }

    static async getOrderById(id: string) {
        const tenantId = requireTenantId();
        const order = await prisma.order.findUnique({
            where: { id },
            include: {
                customer: true,
                items: {
                    include: {
                        product: true,
                        batchAllocations: {
                            where: { tenantId },
                            include: { batch: { select: { id: true, batchNumber: true, expiryDate: true } } },
                        },
                    }
                }
            }
        });
        if (!order) throw new AppError(404, 'Order not found');
        return order;
    }

    static async updateStatus(id: string, status: string) {
        return await prisma.order.update({
            where: { id },
            data: { status },
            include: { customer: true }
        });
    }
}
