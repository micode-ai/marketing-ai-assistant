import { UserRole } from './enums';

export interface User {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: UserRole;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile extends User {
  organizations: OrganizationMembership[];
}

export interface OrganizationMembership {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  role: UserRole;
  joinedAt: Date;
}

export interface CreateUserDto {
  email: string;
  name: string;
  password: string;
}

export interface UpdateUserDto {
  name?: string;
  avatarUrl?: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface LoginDto {
  email: string;
  password: string;
}

export interface RegisterDto {
  email: string;
  name: string;
  password: string;
  organizationName?: string;
}
