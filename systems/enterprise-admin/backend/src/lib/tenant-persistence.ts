import { requireTenantId } from './tenant.context';

type TenantScopedRecord = object;

export interface TenantPersistence {
  tenantId: string;
  where<T extends TenantScopedRecord>(where?: T): T & { tenantId: string };
  data<T extends TenantScopedRecord>(data: T): T & { tenantId: string };
  many<T extends TenantScopedRecord>(data: T[]): Array<T & { tenantId: string }>;
}

export function tenantPersistence(): TenantPersistence {
  const tenantId = requireTenantId();

  return {
    tenantId,
    where<T extends TenantScopedRecord>(where = {} as T) {
      return { ...where, tenantId };
    },
    data<T extends TenantScopedRecord>(data: T) {
      return { ...data, tenantId };
    },
    many<T extends TenantScopedRecord>(data: T[]) {
      return data.map((item) => ({ ...item, tenantId }));
    },
  };
}
