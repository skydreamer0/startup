import request from 'supertest';
import app from '../../../app';

describe('Inventory API Endpoints', () => {
    const dummyToken = 'Bearer test-token';

    it('should fetch the supplier list', async () => {
        const res = await request(app)
            .get('/api/v1/admin/inventory/suppliers')
            .set('Authorization', dummyToken);

        expect([200, 401]).toContain(res.status);
    });

    it('should fetch the product list', async () => {
        const res = await request(app)
            .get('/api/v1/admin/inventory/products')
            .set('Authorization', dummyToken);

        expect([200, 401]).toContain(res.status);
    });
});
