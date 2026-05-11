import { ADMIN_ROLES } from './admin-roles';
import { CLIENT_ROLES } from './client-roles';
import {
  ADMIN_ROLE_PERMISSIONS,
  CLIENT_ROLE_PERMISSIONS,
} from './role-permissions';

/**
 * Lockstep regression-prevention test. Asserts that every value in
 * `ADMIN_ROLES` / `CLIENT_ROLES` has an entry in the corresponding
 * permission map, and that no orphan keys exist in the maps. Widening
 * either enum without extending the map fails CI; adding a permission entry
 * for a non-existent role also fails CI.
 *
 * This is the only mechanical guarantee that the static permission map
 * stays in lockstep with the role enums.
 */
describe('ROLE_PERMISSIONS lockstep', () => {
  it('every AdminRole has a permission entry', () => {
    for (const role of ADMIN_ROLES) {
      expect(ADMIN_ROLE_PERMISSIONS[role]).toBeDefined();
      expect(Array.isArray(ADMIN_ROLE_PERMISSIONS[role])).toBe(true);
    }
  });

  it('ADMIN_ROLE_PERMISSIONS has no orphan keys', () => {
    const adminRoleSet = new Set<string>(ADMIN_ROLES);
    for (const key of Object.keys(ADMIN_ROLE_PERMISSIONS)) {
      expect(adminRoleSet.has(key)).toBe(true);
    }
  });

  it('every ClientRole has a permission entry', () => {
    for (const role of CLIENT_ROLES) {
      expect(CLIENT_ROLE_PERMISSIONS[role]).toBeDefined();
      expect(Array.isArray(CLIENT_ROLE_PERMISSIONS[role])).toBe(true);
    }
  });

  it('CLIENT_ROLE_PERMISSIONS has no orphan keys', () => {
    const clientRoleSet = new Set<string>(CLIENT_ROLES);
    for (const key of Object.keys(CLIENT_ROLE_PERMISSIONS)) {
      expect(clientRoleSet.has(key)).toBe(true);
    }
  });

  it('all permission strings are non-empty', () => {
    for (const role of ADMIN_ROLES) {
      for (const perm of ADMIN_ROLE_PERMISSIONS[role]) {
        expect(perm.length).toBeGreaterThan(0);
      }
    }
    for (const role of CLIENT_ROLES) {
      for (const perm of CLIENT_ROLE_PERMISSIONS[role]) {
        expect(perm.length).toBeGreaterThan(0);
      }
    }
  });
});
