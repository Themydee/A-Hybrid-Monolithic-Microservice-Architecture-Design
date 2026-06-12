import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { users, roles, permissions, userRoles, rolePermissions } from './schema/schema';
import { UserStatus, UserRole } from '@hybrid/shared';
import { and, eq } from 'drizzle-orm';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.DATABASE_URL || 'postgres://hybrid:hybrid@localhost:5432/hybrid_auth';

console.log('Seeding database:', databaseUrl);

const pool = new Pool({
  connectionString: databaseUrl,
});

const db = drizzle(pool);

async function seed() {
  try {
    // 1. Seed Permissions
    const permissionsData = [
      { name: 'policy:write', description: 'Write and update Rego policies' },
      { name: 'policy:read', description: 'Read Rego policies' },
      { name: 'audit:read', description: 'Read system audit logs' },
      { name: 'profile:read', description: 'Read user profile details' },
      { name: 'profile:write', description: 'Modify user profile details' },
    ];

    console.log('Inserting permissions...');
    const insertedPermissions: Record<string, string> = {};
    for (const p of permissionsData) {
      const existing = await db.select().from(permissions).where(eq(permissions.name, p.name)).limit(1);
      if (existing.length === 0) {
        const result = await db.insert(permissions).values(p).returning();
        insertedPermissions[p.name] = result[0].id;
      } else {
        insertedPermissions[p.name] = existing[0].id;
      }
    }

    // 2. Seed Roles
    const rolesData = [
      { name: UserRole.ADMIN, description: 'Super administrator with full access' },
      { name: UserRole.USER, description: 'Standard end user with profile access' },
      { name: UserRole.AUDITOR, description: 'Compliance auditor with policy and log read access' },
    ];

    console.log('Inserting roles...');
    const insertedRoles: Record<string, string> = {};
    for (const r of rolesData) {
      const existing = await db.select().from(roles).where(eq(roles.name, r.name)).limit(1);
      if (existing.length === 0) {
        const result = await db.insert(roles).values(r).returning();
        insertedRoles[r.name] = result[0].id;
      } else {
        insertedRoles[r.name] = existing[0].id;
      }
    }

    // 3. Map Roles to Permissions
    console.log('Mapping roles to permissions...');
    const mappings = [
      // Admin gets everything
      { role: UserRole.ADMIN, permission: 'policy:write' },
      { role: UserRole.ADMIN, permission: 'policy:read' },
      { role: UserRole.ADMIN, permission: 'audit:read' },
      { role: UserRole.ADMIN, permission: 'profile:read' },
      { role: UserRole.ADMIN, permission: 'profile:write' },

      // User gets profile access
      { role: UserRole.USER, permission: 'profile:read' },
      { role: UserRole.USER, permission: 'profile:write' },

      // Auditor gets read access to audits and policies
      { role: UserRole.AUDITOR, permission: 'audit:read' },
      { role: UserRole.AUDITOR, permission: 'policy:read' },
    ];

    for (const m of mappings) {
      const roleId = insertedRoles[m.role];
      const permissionId = insertedPermissions[m.permission];
      if (roleId && permissionId) {
        const existing = await db
          .select()
          .from(rolePermissions)
          .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permissionId)))
          .limit(1);
        if (existing.length === 0) {
          await db.insert(rolePermissions).values({ roleId, permissionId });
        }
      }
    }

    // 4. Seed Default Admin User
    const adminEmail = 'admin@example.com';
    const adminPassword = 'Password123!';
    const existingAdmin = await db.select().from(users).where(eq(users.email, adminEmail)).limit(1);

    if (existingAdmin.length === 0) {
      console.log('Creating default admin user...');
      // bcrypt cost factor 12 (NFR1 compliance)
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      const newAdminResult = await db
        .insert(users)
        .values({
          email: adminEmail,
          passwordHash,
          status: UserStatus.ACTIVE,
        })
        .returning();

      const adminUser = newAdminResult[0];
      const adminRoleId = insertedRoles[UserRole.ADMIN];
      if (adminRoleId) {
        await db.insert(userRoles).values({
          userId: adminUser.id,
          roleId: adminRoleId,
        });
      }
      console.log(`Default Admin created: ${adminEmail} / ${adminPassword}`);
    } else {
      console.log('Default admin user already exists.');
    }

    console.log('Database seeding finished successfully!');
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

seed();
