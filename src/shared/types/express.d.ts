import 'express';

export interface AdminPrincipal {
  adminUserId: string;
  sessionId: string;
  email: string;
  status: 'active' | 'disabled';
}

declare module 'express' {
  interface Request {
    adminUser?: AdminPrincipal;
  }
}
