import { Router } from 'express';
import { CrmController } from './crm.controller';
import { authMiddleware } from '../../middleware/auth.middleware';
import { validate } from '../../middleware/validate.middleware';
import { createCustomerSchema, updateCustomerSchema, createInteractionSchema } from './crm.schema';

const router = Router();

// Protect all CRM routes
router.use(authMiddleware);

// Customers
router.get('/customers', CrmController.getCustomers);
router.post('/customers', validate(createCustomerSchema), CrmController.createCustomer);

router.get('/customers/:id', CrmController.getCustomerById);
router.put('/customers/:id', validate(updateCustomerSchema), CrmController.updateCustomer);

// Interactions
router.post(
    '/customers/:id/interactions',
    validate(createInteractionSchema),
    CrmController.addInteraction
);

export default router;
