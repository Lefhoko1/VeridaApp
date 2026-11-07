import type { PermissionRow } from '@/design-system';

import type { PersonPermission } from '../../domain/models';

export const toPermissionRows = (items: PersonPermission[]): PermissionRow[] =>
  items.map((item) => ({
    code: item.code,
    description: item.description,
    allowed: item.allowed,
    isPersonal: item.override !== null,
    roleDefault: item.fromRole,
  }));
