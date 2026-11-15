import type { Role } from "./roles";

export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  isDemo: true,
} as const;

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
  isDemo: boolean;
};

export function toPublicUser(u: {
  id: string;
  email: string;
  name: string;
  role: string;
  isDemo: boolean;
}): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role as Role,
    isDemo: u.isDemo,
  };
}