import { Request, Response } from "express";
import { loginUser, registerUser } from "../services/auth.service";
import { AppError } from "../utils/AppError";
import { isRecord, validationError } from "../utils/validation";

const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const validateRegisterBody = (body: unknown) => {
  if (!isRecord(body)) {
    throw validationError({ body: "Request body must be a JSON object" });
  }
  const errors: Record<string, string> = {};
  if (typeof body.name !== "string" || body.name.trim().length < 2 || body.name.trim().length > 100) {
    errors.name = "Name must be between 2 and 100 characters";
  }
  if (typeof body.email !== "string" || body.email.length > 254 || !isValidEmail(body.email)) {
    errors.email = "Provide a valid email address";
  }
  if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) {
    errors.password = "Password must be between 8 and 128 characters";
  }
  if (body.role !== undefined && body.role !== "staff") {
    errors.role = "Public registration only permits the staff role";
  }
  if (Object.keys(body).some((key) => !["name", "email", "password", "role"].includes(key))) {
    errors.body = "Request contains unsupported fields";
  }
  if (Object.keys(errors).length) throw validationError(errors);
  return {
    name: body.name as string,
    email: body.email as string,
    password: body.password as string,
    role: body.role === "staff" ? "staff" as const : undefined,
  };
};

const validateLoginBody = (body: unknown) => {
  if (!isRecord(body)) {
    throw validationError({ body: "Request body must be a JSON object" });
  }
  const errors: Record<string, string> = {};
  if (typeof body.email !== "string" || body.email.length > 254 || !isValidEmail(body.email)) {
    errors.email = "Provide a valid email address";
  }
  if (typeof body.password !== "string" || body.password.length === 0 || body.password.length > 128) {
    errors.password = "Password is required and must not exceed 128 characters";
  }
  if (Object.keys(body).some((key) => !["email", "password"].includes(key))) {
    errors.body = "Request contains unsupported fields";
  }
  if (Object.keys(errors).length) throw validationError(errors);
  return { email: body.email as string, password: body.password as string };
};

export const register = async (
  req: Request,
  res: Response
): Promise<void> => {
  const user = await registerUser(validateRegisterBody(req.body));
  res.status(201).json({
    success: true,
    message: "Account registered successfully",
    user,
  });
};

export const login = async (
  req: Request,
  res: Response
): Promise<void> => {
  const result = await loginUser(validateLoginBody(req.body));
  res.status(200).json({ success: true, ...result });
};

export const getMe = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!req.user) {
    throw new AppError("Authentication is required", 401, "AUTH_REQUIRED");
  }
  res.status(200).json({ success: true, user: req.user });
};
