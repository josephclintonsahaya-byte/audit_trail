import { Types } from "mongoose";
import { AppError } from "./AppError";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const validationError = (
  errors: Record<string, string>
): AppError => new AppError("Validation failed", 400, "VALIDATION_ERROR", errors);

export const assertObjectId = (value: unknown, label: string): string => {
  if (
    typeof value !== "string" ||
    !/^[a-f\d]{24}$/i.test(value) ||
    !Types.ObjectId.isValid(value)
  ) {
    throw new AppError(`Invalid ${label}`, 400, "INVALID_ID");
  }

  return value;
};
