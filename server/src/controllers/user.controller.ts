import { Request, Response } from "express";
import User, { UserRole } from "../models/User";
import { AppError } from "../utils/AppError";
import { paginationMetadata, parsePagination } from "../utils/pagination";
import { isRecord, validationError } from "../utils/validation";
import { hashPassword } from "../services/auth.service";

const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const validateUserBody = (
  body: unknown,
  partial: boolean
): Partial<{ name: string; email: string; role: UserRole }> => {
  if (!isRecord(body)) {
    throw validationError({ body: "Request body must be a JSON object" });
  }

  const errors: Record<string, string> = {};
  const allowedFields = ["name", "email", "role"];
  for (const field of Object.keys(body)) {
    if (!allowedFields.includes(field)) {
      errors[field] = field === "password" || field === "passwordHash"
        ? "Use the authentication endpoints to set or change passwords"
        : "Field is not allowed";
    }
  }
  if (!partial) {
    for (const field of ["name", "email"]) {
      if (!(field in body)) errors[field] = "This field is required";
    }
  } else if (!Object.keys(body).some((field) => allowedFields.includes(field))) {
    errors.body = "Provide at least one user field to update";
  }

  const result: Partial<{ name: string; email: string; role: UserRole }> = {};
  if ("name" in body) {
    if (
      typeof body.name !== "string" ||
      body.name.trim().length < 2 ||
      body.name.trim().length > 100
    ) {
      errors.name = "Name must be between 2 and 100 characters";
    } else {
      result.name = body.name.trim();
    }
  }
  if ("email" in body) {
    if (
      typeof body.email !== "string" ||
      body.email.length > 254 ||
      !isValidEmail(body.email)
    ) {
      errors.email = "Provide a valid email address";
    } else {
      result.email = body.email.trim().toLowerCase();
    }
  }
  if ("role" in body) {
    if (body.role !== "admin" && body.role !== "manager" && body.role !== "staff") {
      errors.role = "Role must be admin, manager, or staff";
    } else {
      result.role = body.role;
    }
  }
  if (Object.keys(errors).length) throw validationError(errors);
  return result;
};

const validateCreateUserBody = (body: unknown) => {
  if (!isRecord(body)) throw validationError({ body: "Request body must be a JSON object" });
  const allowed = ["name", "email", "password", "confirmPassword", "role"];
  const errors: Record<string, string> = {};
  for (const field of Object.keys(body)) {
    if (!allowed.includes(field)) errors[field] = "Field is not allowed";
  }
  const profile = validateUserBody({ name: body.name, email: body.email, ...(body.role !== undefined ? { role: body.role } : {}) }, false);
  if (typeof body.password !== "string" || body.password.length < 8 || body.password.length > 128) {
    errors.password = "Password must be between 8 and 128 characters";
  }
  if (typeof body.confirmPassword !== "string" || body.password !== body.confirmPassword) {
    errors.confirmPassword = "Password confirmation does not match";
  }
  if (Object.keys(errors).length) throw validationError(errors);
  return { ...profile, password: body.password as string };
};

export const createUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const input = validateCreateUserBody(req.body);
  const { password, ...profile } = input;
  const user = await User.create({ ...profile, passwordHash: await hashPassword(password) });
  res.status(201).json({ success: true, message: "User created successfully", user });
};

export const getUsers = async (
  req: Request,
  res: Response
): Promise<void> => {
  const pagination = parsePagination(req.query);
  const filter: Record<string, unknown> = {};
  if (typeof req.query.search === "string" && req.query.search.trim()) {
    const escaped = req.query.search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ name: { $regex: escaped, $options: "i" } }, { email: { $regex: escaped, $options: "i" } }];
  }
  if (typeof req.query.role === "string" && req.query.role) {
    if (!["admin", "manager", "staff"].includes(req.query.role)) throw validationError({ role: "Role must be admin, manager, or staff" });
    filter.role = req.query.role;
  }
  const [users, total] = await Promise.all([
    User.find(filter)
      .sort({ _id: 1 })
      .skip(pagination.skip)
      .limit(pagination.limit),
    User.countDocuments(filter),
  ]);
  res.status(200).json({
    success: true,
    users,
    data: users,
    ...paginationMetadata(pagination, total),
  });
};

export const getUserById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  res.status(200).json({ success: true, user });
};

export const updateUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    validateUserBody(req.body, true),
    { returnDocument: "after", runValidators: true }
  );
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  res.status(200).json({ success: true, message: "User updated successfully", user });
};

export const changeUserPassword = async (
  req: Request,
  res: Response
): Promise<void> => {
  if (!isRecord(req.body)) throw validationError({ body: "Request body must be a JSON object" });
  const errors: Record<string, string> = {};
  for (const field of Object.keys(req.body)) {
    if (field !== "newPassword" && field !== "confirmNewPassword") errors[field] = "Field is not allowed";
  }
  const { newPassword, confirmNewPassword } = req.body;
  if (typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 128) {
    errors.newPassword = "Password must be between 8 and 128 characters";
  }
  if (typeof confirmNewPassword !== "string" || newPassword !== confirmNewPassword) {
    errors.confirmNewPassword = "Password confirmation does not match";
  }
  if (Object.keys(errors).length) throw validationError(errors);

  const passwordHash = await hashPassword(newPassword as string);
  const user = await User.findByIdAndUpdate(req.params.id, { passwordHash }, { runValidators: true });
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  res.status(200).json({ success: true, message: "User password changed successfully" });
};

export const deleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  res.status(200).json({ success: true, message: "User deleted successfully", user });
};
