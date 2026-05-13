import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../app';
import { basePrisma } from '../lib/prisma';

// Ensure DB is seeded before tests
beforeAll(async () => {
    const admin = await basePrisma.user.findFirst({ where: { email: 'admin@system.local' } });
    if (!admin) {
        throw new Error('Database is not seeded. Run `npm run db:seed` first.');
    }
});

afterAll(async () => {
    await basePrisma.$disconnect();
});

describe('Auth API (Integration)', () => {
    let accessToken: string;
    let refreshToken: string;

    describe('POST /api/v1/admin/auth/login', () => {
        it('should login with valid credentials', async () => {
            const res = await request(app)
                .post('/api/v1/admin/auth/login')
                .send({ email: 'admin@system.local', password: 'Admin@123!' });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.accessToken).toBeDefined();
            expect(res.body.data.refreshToken).toBeDefined();
            expect(res.body.data.user.email).toBe('admin@system.local');

            accessToken = res.body.data.accessToken;
            refreshToken = res.body.data.refreshToken;
        });

        it('should reject invalid password', async () => {
            const res = await request(app)
                .post('/api/v1/admin/auth/login')
                .send({ email: 'admin@system.local', password: 'wrongpassword' });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });

        it('should reject non-existent email', async () => {
            const res = await request(app)
                .post('/api/v1/admin/auth/login')
                .send({ email: 'notexist@test.com', password: 'password123' });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });

        it('should reject invalid email format (Zod validation)', async () => {
            const res = await request(app)
                .post('/api/v1/admin/auth/login')
                .send({ email: 'not-an-email', password: 'password123' });

            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('VALIDATION_FAILED');
        });
    });

    describe('POST /api/v1/admin/auth/refresh', () => {
        it('should issue a new access token', async () => {
            const res = await request(app)
                .post('/api/v1/admin/auth/refresh')
                .send({ refreshToken });

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.accessToken).toBeDefined();
        });

        it('should reject invalid refresh token', async () => {
            const res = await request(app)
                .post('/api/v1/admin/auth/refresh')
                .send({ refreshToken: 'invalid-token' });

            expect(res.status).toBe(401);
            expect(res.body.success).toBe(false);
        });
    });

    describe('GET /api/v1/admin/auth/me', () => {
        it('should return user profile with permissions', async () => {
            const res = await request(app)
                .get('/api/v1/admin/auth/me')
                .set('Authorization', `Bearer ${accessToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.email).toBe('admin@system.local');
            expect(res.body.data.roles).toContain('SUPER_ADMIN');
            expect(res.body.data.permissions.length).toBeGreaterThan(0);
        });

        it('should reject request without token', async () => {
            const res = await request(app).get('/api/v1/admin/auth/me');

            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/v1/admin/auth/logout', () => {
        it('should logout successfully', async () => {
            const res = await request(app)
                .post('/api/v1/admin/auth/logout')
                .set('Authorization', `Bearer ${accessToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
        });
    });
});

describe('Users API (Integration)', () => {
    let accessToken: string;

    beforeAll(async () => {
        const loginRes = await request(app)
            .post('/api/v1/admin/auth/login')
            .send({ email: 'admin@system.local', password: 'Admin@123!' });
        accessToken = loginRes.body.data.accessToken;
    });

    describe('GET /api/v1/admin/users', () => {
        it('should return paginated user list', async () => {
            const res = await request(app)
                .get('/api/v1/admin/users')
                .set('Authorization', `Bearer ${accessToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);
            expect(res.body.meta).toBeDefined();
            expect(res.body.meta.page).toBe(1);
            expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
        });

        it('should reject without auth', async () => {
            const res = await request(app).get('/api/v1/admin/users');
            expect(res.status).toBe(401);
        });
    });

    describe('POST /api/v1/admin/users (Create)', () => {
        const testEmail = `testuser-${Date.now()}@test.com`;

        it('should create a new user', async () => {
            const res = await request(app)
                .post('/api/v1/admin/users')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    email: testEmail,
                    password: 'TestPassword123!',
                    fullName: 'Test User',
                });

            expect(res.status).toBe(201);
            expect(res.body.success).toBe(true);
            expect(res.body.data.email).toBe(testEmail);
        });

        it('should reject duplicate email', async () => {
            const res = await request(app)
                .post('/api/v1/admin/users')
                .set('Authorization', `Bearer ${accessToken}`)
                .send({
                    email: testEmail,
                    password: 'AnotherPass123!',
                    fullName: 'Duplicate User',
                });

            expect(res.status).toBe(409);
            expect(res.body.success).toBe(false);
        });
    });
});

describe('Roles API (Integration)', () => {
    let accessToken: string;

    beforeAll(async () => {
        const loginRes = await request(app)
            .post('/api/v1/admin/auth/login')
            .send({ email: 'admin@system.local', password: 'Admin@123!' });
        accessToken = loginRes.body.data.accessToken;
    });

    describe('GET /api/v1/admin/roles', () => {
        it('should return roles with permissions', async () => {
            const res = await request(app)
                .get('/api/v1/admin/roles')
                .set('Authorization', `Bearer ${accessToken}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(Array.isArray(res.body.data)).toBe(true);

            const superAdmin = res.body.data.find((r: { name: string }) => r.name === 'SUPER_ADMIN');
            expect(superAdmin).toBeDefined();
            expect(superAdmin.permissions.length).toBe(24);
        });
    });
});

describe('404 Handler', () => {
    it('should return 404 for unknown routes', async () => {
        const res = await request(app).get('/api/v1/admin/nonexistent');

        expect(res.status).toBe(404);
        expect(res.body.success).toBe(false);
        expect(res.body.error.code).toBe('NOT_FOUND');
    });
});
