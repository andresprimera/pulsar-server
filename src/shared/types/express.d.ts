import 'express';

export interface AdminPrincipal {
  adminUserId: string;
  sessionId: string;
  email: string;
  status: 'active' | 'disabled';
}

export interface ClientUserPrincipal {
  userId: string;
  clientId: string;
  sessionId: string;
  email: string;
  status: 'active' | 'inactive' | 'archived';
}

declare module 'express' {
  interface Request {
    adminUser?: AdminPrincipal;
    clientUser?: ClientUserPrincipal;
  }
}
