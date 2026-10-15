import { ClientSession, Types } from "mongoose";
import Event from "../models/Event";
import { AppError } from "../utils/AppError";
import { assertObjectId, isRecord, validationError } from "../utils/validation";
import { paginationMetadata } from "../utils/pagination";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

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

export interface EventPayload {
  [key: string]: unknown;
}

export interface CreateEventInput {
  eventType: string;
  entityType: string;
  entityId: string | Types.ObjectId;
  performedBy: string | Types.ObjectId;
  payload?: EventPayload;
  session?: ClientSession;
}

export const createBusinessEvent = async ({
  eventType,
  entityType,
  entityId,
  performedBy,
  payload = {},
  session,
}: CreateEventInput) => {
  const errors: Record<string, string> = {};
  if (typeof eventType !== "string" || !eventType.trim() || eventType.length > 100) {
    errors.eventType = "Must be a non-empty value of at most 100 characters";
  }
  if (typeof entityType !== "string" || !entityType.trim() || entityType.length > 100) {
    errors.entityType = "Must be a non-empty value of at most 100 characters";
  }
  if (payload !== undefined && !isRecord(payload)) {
    errors.payload = "Payload must be a JSON object";
  }
  if (Object.keys(errors).length) throw validationError(errors);
  const validatedEntityId = entityId instanceof Types.ObjectId
    ? entityId
    : assertObjectId(entityId, "event entity ID");
  const validatedPerformedBy = performedBy instanceof Types.ObjectId
    ? performedBy
    : assertObjectId(performedBy, "event performer ID");

  const event = new Event({
    eventType,
    entityType,
    entityId: validatedEntityId,
    performedBy: validatedPerformedBy,
    payload,
  });

  return session ? event.save({ session }) : event.save();
};

export const getEvents = async (page?: unknown, limit?: unknown): Promise<any> => {
  const parsedPage = parsePositiveInteger(page, "page", DEFAULT_PAGE);
  const parsedLimit = parsePositiveInteger(limit, "limit", DEFAULT_LIMIT);
  if (parsedLimit > MAX_LIMIT) {
    throw new AppError(
      `Must not exceed ${MAX_LIMIT}`,
      400,
      "VALIDATION_ERROR",
      { limit: `Must not exceed ${MAX_LIMIT}` }
    );
  }
  const skip = (parsedPage - 1) * parsedLimit;
  const [events, total] = await Promise.all([
    Event.find()
      .populate("performedBy")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(parsedLimit),
    Event.countDocuments(),
  ]);
  return {
    events,
    ...paginationMetadata({ page: parsedPage, limit: parsedLimit }, total),
  };
};

export const getEventsByEntity = async (
  entityType: string,
  entityId: string | Types.ObjectId,
  page?: unknown,
  limit?: unknown
): Promise<any> => {
  if (!entityType.trim() || entityType.length > 100) {
    throw new AppError("Invalid event entity type", 400, "VALIDATION_ERROR", {
      entityType: "Must be a non-empty value of at most 100 characters",
    });
  }
  const validEntityId = entityId instanceof Types.ObjectId
    ? entityId
    : assertObjectId(entityId, "event entity ID");

  const parsedPage = parsePositiveInteger(page, "page", DEFAULT_PAGE);
  const parsedLimit = parsePositiveInteger(limit, "limit", DEFAULT_LIMIT);
  if (parsedLimit > MAX_LIMIT) {
    throw new AppError(
      `Must not exceed ${MAX_LIMIT}`,
      400,
      "VALIDATION_ERROR",
      { limit: `Must not exceed ${MAX_LIMIT}` }
    );
  }
  const skip = (parsedPage - 1) * parsedLimit;
  const [events, total] = await Promise.all([
    Event.find({ entityType, entityId: validEntityId })
      .populate("performedBy")
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(parsedLimit),
    Event.countDocuments({ entityType, entityId: validEntityId }),
  ]);
  return {
    events,
    ...paginationMetadata({ page: parsedPage, limit: parsedLimit }, total),
  };
}
