import { ClientSession, Types } from "mongoose";
import Event from "../models/Event";
import { AppError } from "../utils/AppError";
import { assertObjectId, isRecord, validationError } from "../utils/validation";

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

export const getEvents = async () => {
  return Event.find().populate("performedBy").sort({ createdAt: -1 });
};

export const getEventsByEntity = async (
  entityType: string,
  entityId: string | Types.ObjectId
) => {
  if (!entityType.trim() || entityType.length > 100) {
    throw new AppError("Invalid event entity type", 400, "VALIDATION_ERROR", {
      entityType: "Must be a non-empty value of at most 100 characters",
    });
  }
  const validEntityId = entityId instanceof Types.ObjectId
    ? entityId
    : assertObjectId(entityId, "event entity ID");
  return Event.find({ entityType, entityId: validEntityId })
    .populate("performedBy")
    .sort({ createdAt: -1 });
};
