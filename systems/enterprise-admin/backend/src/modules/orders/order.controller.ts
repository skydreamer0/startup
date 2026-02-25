import { Request, Response, NextFunction } from 'express';
import { OrderService } from './order.service';

export class OrderController {
    static async create(req: Request, res: Response, next: NextFunction) {
        try {
            const order = await OrderService.createOrder(req.body);
            res.status(201).json({
                success: true,
                data: order
            });
        } catch (error) {
            next(error);
        }
    }

    static async list(req: Request, res: Response, next: NextFunction) {
        try {
            const filters = {
                customerId: typeof req.query.customerId === 'string' ? req.query.customerId : undefined,
                status: typeof req.query.status === 'string' ? req.query.status : undefined
            };
            const orders = await OrderService.getOrders(filters);
            res.json({
                success: true,
                data: orders
            });
        } catch (error) {
            next(error);
        }
    }

    static async getById(req: Request, res: Response, next: NextFunction) {
        try {
            const orderId = req.params.id as string;
            const order = await OrderService.getOrderById(orderId);
            res.json({
                success: true,
                data: order
            });
        } catch (error) {
            next(error);
        }
    }

    static async updateStatus(req: Request, res: Response, next: NextFunction) {
        try {
            const { status } = req.body;
            const orderId = req.params.id as string;
            if (typeof status !== 'string') throw new Error('Status must be a string');
            const order = await OrderService.updateStatus(orderId, status);
            res.json({
                success: true,
                data: order
            });
        } catch (error) {
            next(error);
        }
    }
}
