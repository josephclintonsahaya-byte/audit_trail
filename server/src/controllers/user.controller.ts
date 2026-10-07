import { Request, Response } from "express";
import User, { UserRole } from "../models/User";
import { AppError } from "../utils/AppError";
import { isRecord, validationError } from "../utils/validation";

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

export const createUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const user = await User.create(validateUserBody(req.body, false));
  res.status(201).json({ success: true, message: "User created successfully", user });
};

export const getUsers = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const users = await User.find();
  res.status(200).json({ success: true, users });
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

export const deleteUser = async (
  req: Request,
  res: Response
): Promise<void> => {
  const user = await User.findByIdAndDelete(req.params.id);
  if (!user) throw new AppError("User not found", 404, "USER_NOT_FOUND");
  res.status(200).json({ success: true, message: "User deleted successfully", user });
};
