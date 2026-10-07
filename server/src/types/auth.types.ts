import { UserRole } from "../models/User";

export interface AuthenticatedUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
