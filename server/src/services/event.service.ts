import { ClientSession, Types } from "mongoose";
import Event from "../models/Event";
import { AppError } from "../utils/AppError";
import { assertObjectId, isRecord, validationError } from "../utils/validation";
import { paginationMetadata } from "../utils/pagination";

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MAX_SEARCH_LENGTH = 100;

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export interface AuditEventFilters {
  search?: unknown;
  eventType?: unknown;
  sort?: unknown;
}

interface EventPageResult {
  events: unknown[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
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

export const getEvents = async (
  page?: unknown,
  limit?: unknown,
  filters: AuditEventFilters = {}
): Promise<EventPageResult & { eventTypes: string[] }> => {
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
  if (!Number.isSafeInteger(skip)) throw validationError({ page: "Is too large" });
  const search = filters.search === undefined ? "" : filters.search;
  const eventType = filters.eventType === undefined ? "all" : filters.eventType;
  const sort = filters.sort === undefined ? "newest" : filters.sort;
  if (typeof search !== "string" || search.length > MAX_SEARCH_LENGTH) {
    throw validationError({ search: `Must be at most ${MAX_SEARCH_LENGTH} characters` });
  }
  if (typeof eventType !== "string" || eventType.length > 100) {
    throw validationError({ eventType: "Must be a valid event type" });
  }
  if (sort !== "newest" && sort !== "oldest") {
    throw validationError({ sort: "Must be newest or oldest" });
  }
  const filter: Record<string, unknown> = {};
  if (eventType !== "all" && eventType) filter.eventType = eventType;
  if (search.trim()) {
    const matcher = new RegExp(escapeRegex(search.trim()), "i");
    const alternatives: Record<string, unknown>[] = [
      { eventType: matcher },
      { entityType: matcher },
    ];
    if (/^[a-f\d]{24}$/i.test(search.trim())) {
      alternatives.push({ entityId: new Types.ObjectId(search.trim()) });
    }
    filter.$or = alternatives;
  }
  const sortOrder = sort === "oldest" ? 1 : -1;
  const [events, total, eventTypes] = await Promise.all([
    Event.find(filter)
      .select("eventType entityType entityId performedBy createdAt timestamp")
      .populate({ path: "performedBy", select: "name" })
      .sort({ createdAt: sortOrder, _id: sortOrder })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    Event.countDocuments(filter),
    Event.distinct("eventType"),
  ]);
  return {
    events,
    ...paginationMetadata({ page: parsedPage, limit: parsedLimit }, total),
    eventTypes: eventTypes.sort(),
  };
};

export const getEventDetails = async (eventId: string) => {
  const validEventId = assertObjectId(eventId, "event ID");
  const event = await Event.findById(validEventId)
    .select("eventType entityType entityId performedBy payload createdAt timestamp")
    .populate({ path: "performedBy", select: "name" })
    .lean();
  if (!event) throw new AppError("Audit event not found", 404, "EVENT_NOT_FOUND");
  return event;
};

export const getEventsByEntity = async (
  entityType: string,
  entityId: string | Types.ObjectId,
  page?: unknown,
  limit?: unknown
): Promise<EventPageResult> => {
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
  if (!Number.isSafeInteger(skip)) throw validationError({ page: "Is too large" });
  const [events, total] = await Promise.all([
    Event.find({ entityType, entityId: validEntityId })
      .select("eventType entityType entityId performedBy createdAt timestamp")
      .populate({ path: "performedBy", select: "name" })
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(parsedLimit)
      .lean(),
    Event.countDocuments({ entityType, entityId: validEntityId }),
  ]);
  return {
    events,
    ...paginationMetadata({ page: parsedPage, limit: parsedLimit }, total),
  };
}
