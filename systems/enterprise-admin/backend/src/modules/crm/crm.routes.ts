import { Router } from 'express';
import { CrmController } from './crm.controller';
import { CsvController } from '../inventory/csv.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { requirePermission } from '../../middleware/rbac.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createCustomerSchema, updateCustomerSchema, createInteractionSchema } from './crm.schema';

const router = Router();

// Protect all CRM routes
router.use(authMiddleware);

// CRM Metrics
router.get('/metrics', requirePermission('read:crm'), CrmController.getMetrics);

// Customers
router.get('/customers', requirePermission('read:crm'), CrmController.getCustomers);
router.post('/customers', requirePermission('manage:crm'), validate({ body: createCustomerSchema }), CrmController.createCustomer);

router.get('/customers/:id', requirePermission('read:crm'), CrmController.getCustomerById);
router.put('/customers/:id', requirePermission('manage:crm'), validate({ body: updateCustomerSchema }), CrmController.updateCustomer);

// Interactions
router.post(
    '/customers/:id/interactions',
    requirePermission('manage:crm'),
    validate({ body: createInteractionSchema }),
    CrmController.addInteraction
);

// CSV Export
router.get('/customers/export/csv', requirePermission('read:crm'), CsvController.exportCustomers);

export default router;
