import { NextFunction, Request, Response } from "express";
import { UserRole } from "../models/User";
import { AppError } from "../utils/AppError";

export const authorizeRoles =
  (...allowedRoles: UserRole[]) =>
  (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AppError("Authentication is required", 401, "AUTH_REQUIRED"));
      return;
    }

    if (!allowedRoles.includes(req.user.role)) {
      next(new AppError("You do not have permission to perform this action", 403, "FORBIDDEN"));
      return;
    }

    next();
  };
