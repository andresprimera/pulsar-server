import 'express';
import type { AdminRole } from '@shared/auth/admin-roles';
import type { ClientRole } from '@shared/auth/client-roles';

export interface AdminPrincipal {
  adminUserId: string;
  sessionId: string;
  email: string;
  status: 'active' | 'disabled';
  role: AdminRole;
}

export interface ClientUserPrincipal {
  userId: string;
  clientId: string;
  sessionId: string;
  email: string;
  status: 'active' | 'inactive' | 'archived';
  clientRole: ClientRole;
}

declare module 'express' {
  interface Request {
    adminUser?: AdminPrincipal;
    clientUser?: ClientUserPrincipal;
  }
}
