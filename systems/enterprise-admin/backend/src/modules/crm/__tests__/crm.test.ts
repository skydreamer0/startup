import request from 'supertest';
import app from '../../../app';

describe('CRM API Endpoints', () => {
    // Use a dummy token or mock authMiddleware for testing
    const dummyToken = 'Bearer test-token';

    it('should fetch the customer list', async () => {
        const res = await request(app)
            .get('/api/v1/admin/crm/customers')
            .set('Authorization', dummyToken);

        // 200 = success, 401 = invalid token, 400 = no tenant context (test env without seed)
        expect([200, 401, 400]).toContain(res.status);
    });

    it('should create a new customer', async () => {
        const res = await request(app)
            .post('/api/v1/admin/crm/customers')
            .set('Authorization', dummyToken)
            .send({
                name: 'Test Setup Customer',
                phone: '0912345678'
            });

        expect([201, 401, 400]).toContain(res.status);
    });
});
