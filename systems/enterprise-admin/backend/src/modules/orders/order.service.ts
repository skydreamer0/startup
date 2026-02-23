import { prisma } from '../../lib/prisma';
import { AppError } from '../../lib/errors';

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
        return await prisma.$transaction(async (tx) => {
            // 1. Validate Customer
            const customer = await tx.customer.findUnique({
                where: { id: data.customerId }
            });
            if (!customer) throw new AppError(404, 'Customer not found');

            let totalOrderAmount = 0;
            const orderItemsData = [];
            const inventoryUpdates = [];
            const transactions = [];

            // 2. Process Items
            for (const item of data.items) {
                const product = await tx.product.findUnique({
                    where: { id: item.productId }
                });

                if (!product) throw new AppError(404, `Product ${item.productId} not found`);
                if (product.stockQuantity < item.quantity) {
                    throw new AppError(400, `Insufficient stock for product ${product.name}`);
                }

                const itemTotal = product.retailPrice * item.quantity;
                totalOrderAmount += itemTotal;

                orderItemsData.push({
                    productId: product.id,
                    quantity: item.quantity,
                    unitPrice: product.retailPrice
                });

                // Prepare stock update
                inventoryUpdates.push(
                    tx.product.update({
                        where: { id: product.id },
                        data: { stockQuantity: { decrement: item.quantity } }
                    })
                );

                // Prepare inventory transaction
                transactions.push({
                    productId: product.id,
                    type: 'OUT',
                    quantity: item.quantity,
                    notes: `Order fulfillment`
                });
            }

            // 3. Create Order
            const order = await tx.order.create({
                data: {
                    customerId: data.customerId,
                    totalAmount: totalOrderAmount,
                    shippingAddress: data.shippingAddress,
                    status: 'pending',
                    items: {
                        create: orderItemsData
                    }
                } as any,
                include: { items: true }
            });

            // 4. Update Stock & Log Transactions
            await Promise.all(inventoryUpdates);

            for (const t of transactions) {
                await tx.inventoryTransaction.create({
                    data: {
                        ...t,
                        referenceId: order.id
                    } as any
                });
            }

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
                } as any
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
        const order = await prisma.order.findUnique({
            where: { id },
            include: {
                customer: true,
                items: {
                    include: { product: true }
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
