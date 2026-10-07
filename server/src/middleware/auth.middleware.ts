import { NextFunction, Request, Response } from "express";
import {
  getAuthenticatedUser,
  verifyAccessToken,
} from "../services/auth.service";
import { AppError } from "../utils/AppError";

export const requireAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> => {
  const authorization = req.header("Authorization");
  if (!authorization) {
    next(new AppError("Authorization token is required", 401, "AUTH_REQUIRED"));
    return;
  }

  const [scheme, token, ...extraParts] = authorization.trim().split(/\s+/);
  if (scheme !== "Bearer" || !token || extraParts.length > 0) {
    next(new AppError(
      "Authorization header must use Bearer authentication",
      401,
      "INVALID_AUTH_HEADER"
    ));
    return;
  }

  const userId = verifyAccessToken(token);
  const user = await getAuthenticatedUser(userId);
  if (!user) {
    next(new AppError("Authenticated user no longer exists", 401, "USER_NOT_FOUND"));
    return;
  }
  req.user = user;
  next();
};
