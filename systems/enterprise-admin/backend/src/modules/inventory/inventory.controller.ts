import { Request, Response, NextFunction } from 'express';
import { InventoryService } from './inventory.service';

export class InventoryController {
    // --- Suppliers ---
    static async getSuppliers(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await InventoryService.getSuppliers();
            res.status(200).json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    static async getSupplierById(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await InventoryService.getSupplierById(req.params.id as string);
            res.status(200).json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    static async createSupplier(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await InventoryService.createSupplier(req.body);
            res.status(201).json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    static async updateSupplier(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await InventoryService.updateSupplier(req.params.id as string, req.body);
            res.status(200).json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    // --- Products ---
    static async getProducts(req: Request, res: Response, next: NextFunction) {
        try {
            const queryParams = {
                lowStock: req.query.lowStock as string | undefined,
                page: req.query.page as string | undefined,
                limit: req.query.limit as string | undefined,
            };
            const data = await InventoryService.getProducts(queryParams);
            res.status(200).json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    static async getProductById(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await InventoryService.getProductById(req.params.id as string);
            res.status(200).json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    static async createProduct(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await InventoryService.createProduct(req.body);
            res.status(201).json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }

    static async updateProduct(req: Request, res: Response, next: NextFunction) {
        try {
            const data = await InventoryService.updateProduct(req.params.id as string, req.body);
            res.status(200).json({ success: true, data });
        } catch (err) {
            next(err);
        }
    }
}
