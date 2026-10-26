import { Request } from "express";
import { validationError } from "./validation";

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export interface Pagination {
  page: number;
  limit: number;
  skip: number;
}

const parsePositiveInteger = (
  value: unknown,
  field: "page" | "limit",
  fallback: number
): number => {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw validationError({ [field]: "Must be a positive integer" });
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw validationError({ [field]: "Must be a positive integer" });
  }
  if (field === "limit" && parsed > MAX_LIMIT) {
    throw validationError({ limit: `Must not exceed ${MAX_LIMIT}` });
  }

  return parsed;
};

export const parsePagination = (query: Request["query"]): Pagination => {
  const page = parsePositiveInteger(query.page, "page", DEFAULT_PAGE);
  const limit = parsePositiveInteger(query.limit, "limit", DEFAULT_LIMIT);
  const skip = (page - 1) * limit;
  if (!Number.isSafeInteger(skip)) {
    throw validationError({ page: "Is too large" });
  }

  return { page, limit, skip };
};

export const paginationMetadata = (
  pagination: Pick<Pagination, "page" | "limit">,
  total: number
) => ({
  page: pagination.page,
  limit: pagination.limit,
  total,
  totalPages: Math.ceil(total / pagination.limit),
});
