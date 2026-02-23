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
];

async function main() {
    console.log('🌱 Seeding database...');

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
        where: { name: 'SUPER_ADMIN' },
        update: {},
        create: {
            name: 'SUPER_ADMIN',
            description: 'Full system access — all permissions granted',
            isSystem: true,
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
        where: { name: 'CONTENT_EDITOR' },
        update: {},
        create: {
            name: 'CONTENT_EDITOR',
            description: 'Can view users and roles but cannot modify',
            isSystem: true,
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

    // 7. Seed CRM Data
    const tagVIP = await prisma.tag.upsert({
        where: { name: 'VIP' },
        create: { name: 'VIP', color: '#FFD700' },
        update: {},
    });
    const tagNew = await prisma.tag.upsert({
        where: { name: 'Newbie' },
        create: { name: 'Newbie', color: '#ADFF2F' },
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
        },
        {
            name: '陳小華',
            phone: '0987654321',
            lineUid: null,
            totalSpent: 800,
            purchaseCount: 1,
            lastInteractionDate: new Date(Date.now() - 86400000 * 3), // 3 days ago
        },
    ];

    for (const c of customers) {
        const customer = await prisma.customer.upsert({
            where: { phone: c.phone },
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

    console.log('\n🎉 Database seeding completed!');
}

main()
    .catch((e) => {
        console.error('❌ Seed failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
