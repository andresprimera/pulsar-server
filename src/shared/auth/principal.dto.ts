import type { AdminRole } from './admin-roles';
import type { ClientRole } from './client-roles';

export interface AdminPrincipalDto {
  kind: 'admin';
  id: string;
  email: string;
  displayName: string;
  status: 'active' | 'disabled';
  role: AdminRole;
  lastLoginAt: string | null;
}

export interface ClientUserPrincipalDto {
  kind: 'clientUser';
  id: string;
  email: string;
  displayName: string;
  status: 'active' | 'inactive' | 'archived';
  clientRole: ClientRole;
  lastLoginAt: string | null;
  clientId: string;
}

export type AuthPrincipalDto = AdminPrincipalDto | ClientUserPrincipalDto;

export interface AuthEnvelopeDto<P extends AuthPrincipalDto> {
  principal: P;
}
