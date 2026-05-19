import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const PERMISSIONS = [
    // Users
    { action: 'read', resource: 'users', description: 'View user list and details' },
    { action: 'create', resource: 'users', description: 'Create new users' },
    { action: 'update', resource: 'users', description: 'Update user information' },
    { action: 'delete', resource: 'users', description: 'Deactivate/delete users' },
    // Roles
    { action: 'read', resource: 'roles', description: 'View roles and permissions' },
    { action: 'create', resource: 'roles', description: 'Create new roles' },
    { action: 'update', resource: 'roles', description: 'Update role permissions' },
    { action: 'delete', resource: 'roles', description: 'Delete custom roles' },
    // Audit Logs
    { action: 'read', resource: 'audit_logs', description: 'View audit logs' },
    // CRM
    { action: 'read', resource: 'crm', description: 'View customers and interactions' },
    { action: 'manage', resource: 'crm', description: 'Manage customer profiles' },
    // Products
    { action: 'read', resource: 'products', description: 'View products and stock levels' },
    { action: 'create', resource: 'products', description: 'Create new products/SKUs' },
    { action: 'update', resource: 'products', description: 'Update product information' },
    // Suppliers
    { action: 'read', resource: 'suppliers', description: 'View suppliers' },
    { action: 'create', resource: 'suppliers', description: 'Add new suppliers' },
    { action: 'update', resource: 'suppliers', description: 'Update supplier information' },
    // Dashboard
    { action: 'read', resource: 'dashboard', description: 'View operations dashboard KPIs' },
    // Orders
    { action: 'read', resource: 'orders', description: 'View and list customer orders' },
    { action: 'create', resource: 'orders', description: 'Create new orders' },
    { action: 'update', resource: 'orders', description: 'Update order status and payment' },
    // Analytics (Phase 5)
    { action: 'read', resource: 'analytics', description: 'View KPI engine metrics' },
    { action: 'manage', resource: 'analytics', description: 'Manage KPI settings' },
    // Reports (Phase 5)
    { action: 'read', resource: 'reports', description: 'View financial and sales reports' },
    // Shifts (Phase 8)
    { action: 'read', resource: 'shifts', description: 'View shift records' },
    { action: 'manage', resource: 'shifts', description: 'Open and close shifts' },
    // Product Batches (Phase 8)
    { action: 'read', resource: 'product_batches', description: 'View product batches' },
    { action: 'manage', resource: 'product_batches', description: 'Manage product batches' },
    // Daily Settlements (Phase 8)
    { action: 'read', resource: 'daily_settlements', description: 'View daily settlements' },
    { action: 'manage', resource: 'daily_settlements', description: 'Confirm daily settlements' },
    // POS (Phase 9)
    { action: 'manage', resource: 'pos', description: 'Process POS checkout and manage POS operations' },
    // Accounting (Phase 6 — INT-03)
    { action: 'read', resource: 'accounting', description: 'View accounting sync logs and provider status' },
    { action: 'manage', resource: 'accounting', description: 'Trigger accounting sync to external provider' },
    // Marketing (Phase 6 — LINE Integration)
    { action: 'manage', resource: 'marketing', description: 'Send LINE broadcasts and manage marketing campaigns' },
];

async function main() {
    console.log(' Seeding database...');

    // 0. Create Default Tenant
    const tenant = await prisma.tenant.upsert({
        where: { slug: 'default' },
        update: {},
        create: {
            name: 'System Default',
            slug: 'default',
            plan: 'pro'
        }
    });
    console.log(`  ✅ Default tenant "${tenant.name}" seeded`);
    const tenantId = tenant.id;

    // 1. Create permissions
    const createdPermissions = [];
    for (const perm of PERMISSIONS) {
        const created = await prisma.permission.upsert({
            where: { action_resource: { action: perm.action, resource: perm.resource } },
            update: {},
            create: perm,
        });
        createdPermissions.push(created);
    }
    console.log(`  ✅ ${createdPermissions.length} permissions seeded`);

    // 2. Create SUPER_ADMIN role
    const superAdminRole = await prisma.role.upsert({
        where: { name_tenantId: { name: 'SUPER_ADMIN', tenantId } },
        update: {},
        create: {
            name: 'SUPER_ADMIN',
            description: 'Full system access — all permissions granted',
            isSystem: true,
            tenantId,
        },
    });
    console.log(`  ✅ Role "${superAdminRole.name}" seeded`);

    // 3. Assign all permissions to SUPER_ADMIN
    for (const perm of createdPermissions) {
        await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: superAdminRole.id, permissionId: perm.id } },
            update: {},
            create: { roleId: superAdminRole.id, permissionId: perm.id },
        });
    }
    console.log(`  ✅ All permissions assigned to SUPER_ADMIN`);

    // 4. Create CONTENT_EDITOR role (example non-admin role)
    const editorRole = await prisma.role.upsert({
        where: { name_tenantId: { name: 'CONTENT_EDITOR', tenantId } },
        update: {},
        create: {
            name: 'CONTENT_EDITOR',
            description: 'Can view users and roles but cannot modify',
            isSystem: true,
            tenantId,
        },
    });
    const readPermissions = createdPermissions.filter((p) => p.action === 'read');
    for (const perm of readPermissions) {
        await prisma.rolePermission.upsert({
            where: { roleId_permissionId: { roleId: editorRole.id, permissionId: perm.id } },
            update: {},
            create: { roleId: editorRole.id, permissionId: perm.id },
        });
    }
    console.log(`  ✅ Role "${editorRole.name}" seeded with read-only permissions`);

    // 5. Create default admin user
    const passwordHash = await argon2.hash('Admin@123!');
    const adminUser = await prisma.user.upsert({
        where: { email: 'admin@system.local' },
        update: {},
        create: {
            email: 'admin@system.local',
            passwordHash,
            fullName: 'System Administrator',
            status: 'active',
            tenantId,
        },
    });
    console.log(`  ✅ Admin user "${adminUser.email}" seeded`);

    // 6. Assign SUPER_ADMIN role to admin user
    await prisma.userRole.upsert({
        where: { userId_roleId: { userId: adminUser.id, roleId: superAdminRole.id } },
        update: {},
        create: { userId: adminUser.id, roleId: superAdminRole.id },
    });
    console.log(`  ✅ SUPER_ADMIN role assigned to admin user`);

    // 7. Seed WALK_IN system customer (used by POS when no customer is selected)
    await prisma.customer.upsert({
        where: { phone_tenantId: { phone: 'WALK_IN', tenantId } },
        update: {},
        create: {
            name: '散客',
            phone: 'WALK_IN',
            tenantId,
        },
    });
    console.log('  ✅ WALK_IN system customer seeded');

    // 8. Seed CRM Data
    const tagVIP = await prisma.tag.upsert({
        where: { name_tenantId: { name: 'VIP', tenantId } },
        create: { name: 'VIP', color: '#FFD700', tenantId },
        update: {},
    });
    const tagNew = await prisma.tag.upsert({
        where: { name_tenantId: { name: 'Newbie', tenantId } },
        create: { name: 'Newbie', color: '#ADFF2F', tenantId },
        update: {},
    });

    const customers = [
        {
            name: '林曉明',
            phone: '0912345678',
            lineUid: 'U1234567890abcdef',
            totalSpent: 15000,
            purchaseCount: 5,
            lastInteractionDate: new Date(),
            tenantId,
        },
        {
            name: '陳小華',
            phone: '0987654321',
            lineUid: null,
            totalSpent: 800,
            purchaseCount: 1,
            lastInteractionDate: new Date(Date.now() - 86400000 * 3), // 3 days ago
            tenantId,
        },
    ];

    for (const c of customers) {
        const customer = await prisma.customer.upsert({
            where: { phone_tenantId: { phone: c.phone!, tenantId } },
            update: {},
            create: c,
        });

        // Add dummy interaction
        await prisma.interaction.create({
            data: {
                customerId: customer.id,
                type: 'STORE_VISIT',
                content: '客戶詢問保健品優惠，對魚油感興趣。',
                interactedAt: new Date(),
                tenantId,
            }
        });

        // Link tag
        await prisma.customerTag.upsert({
            where: { customerId_tagId: { customerId: customer.id, tagId: customer.totalSpent > 10000 ? tagVIP.id : tagNew.id } },
            create: { customerId: customer.id, tagId: customer.totalSpent > 10000 ? tagVIP.id : tagNew.id },
            update: {},
        });
    }
    console.log(`  ✅ CRM dummy data seeded`);

    // 9. Seed Inventory Data
    const catHealth = await prisma.productCategory.upsert({
        where: { name_tenantId: { name: 'Health Supplements', tenantId } },
        create: { name: 'Health Supplements', description: '保健品類', tenantId },
        update: {},
    });
    const catDrug = await prisma.productCategory.upsert({
        where: { name_tenantId: { name: 'OTC Drugs', tenantId } },
        create: { name: 'OTC Drugs', description: '非處方藥品', tenantId },
        update: {},
    });

    const supplier1 = await prisma.supplier.upsert({
        where: { id: 'seed-supplier-1' },
        create: {
            id: 'seed-supplier-1',
            name: '永信藥品',
            contactName: '王經理',
            phone: '04-2345-6789',
            email: 'wang@yungshin.com',
            deliveryReliability: 96.5,
            defectRate: 0.3,
            rating: 92,
            tenantId,
        },
        update: {},
    });
    const supplier2 = await prisma.supplier.upsert({
        where: { id: 'seed-supplier-2' },
        create: {
            id: 'seed-supplier-2',
            name: '台灣大塚',
            contactName: '林小姐',
            phone: '02-8765-4321',
            email: 'lin@otsuka.tw',
            deliveryReliability: 91.2,
            defectRate: 1.1,
            rating: 85,
            tenantId,
        },
        update: {},
    });

    const products = [
        { sku: 'HS-FISH-01', name: '深海魚油 Omega-3 (120粒)', costPrice: 450, retailPrice: 890, stockQuantity: 8, safetyStock: 15, categoryId: catHealth.id, supplierId: supplier1.id, tenantId },
        { sku: 'HS-VITA-C1', name: '維他命C 1000mg (60粒)', costPrice: 180, retailPrice: 350, stockQuantity: 52, safetyStock: 20, categoryId: catHealth.id, supplierId: supplier1.id, tenantId },
        { sku: 'OTC-PAIN-01', name: '普拿疼 加強錠 (10粒)', costPrice: 65, retailPrice: 120, stockQuantity: 3, safetyStock: 10, categoryId: catDrug.id, supplierId: supplier2.id, tenantId },
        { sku: 'HS-PROB-01', name: '益生菌粉 (30包)', costPrice: 520, retailPrice: 980, stockQuantity: 25, safetyStock: 10, categoryId: catHealth.id, supplierId: supplier1.id, tenantId },
    ];

    for (const p of products) {
        await prisma.product.upsert({
            where: { sku_tenantId: { sku: p.sku, tenantId } },
            create: p,
            update: {},
        });
    }
    console.log(`  ✅ Inventory dummy data seeded (${products.length} products, 2 suppliers)`);

    // 10. Seed Orders
    console.log('   Seeding dummy orders...');
    const dbCustomers = await prisma.customer.findMany();
    const dbProducts = await prisma.product.findMany();

    if (dbCustomers.length > 0 && dbProducts.length > 0) {
        const order1 = await prisma.order.create({
            data: {
                customerId: dbCustomers[0].id,
                status: 'completed',
                paymentStatus: 'paid',
                totalAmount: 1890,
                tenantId,
                items: {
                    create: [
                        { productId: dbProducts[0].id, quantity: 2, unitPrice: 890 },
                        { productId: dbProducts[1].id, quantity: 1, unitPrice: 110 }
                    ]
                }
            }
        });

        // Add corresponding transactions
        await prisma.inventoryTransaction.createMany({
            data: [
                { productId: dbProducts[0].id, type: 'OUT', quantity: 2, referenceId: order1.id, notes: 'Order Sale', tenantId },
                { productId: dbProducts[1].id, type: 'OUT', quantity: 1, referenceId: order1.id, notes: 'Order Sale', tenantId }
            ]
        });
    }

    console.log('\n Database seeding completed!');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
