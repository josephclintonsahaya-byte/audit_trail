import { Request, Response } from "express";
import { getEvents, getEventsByEntity } from "../services/event.service";
import { AppError } from "../utils/AppError";

export const getAllEvents = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const events = await getEvents();
  res.status(200).json({ success: true, events });
};

export const getEventsForEntity = async (
  req: Request,
  res: Response
): Promise<void> => {
  const entityType = typeof req.params.entityType === "string"
    ? req.params.entityType
    : "";
  if (!entityType || entityType.trim().length > 100) {
    throw new AppError("Invalid event entity type", 400, "VALIDATION_ERROR", {
      entityType: "Must be a non-empty value of at most 100 characters",
    });
  }
  const entityId = String(req.params.entityId);
  const events = await getEventsByEntity(entityType, entityId);
  res.status(200).json({ success: true, entityType, entityId, events });
};
