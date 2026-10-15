import { Request, Response } from "express";
import {
  getEvents,
  getEventsByEntity,
  createBusinessEvent,
} from "../services/event.service";
import { AppError } from "../utils/AppError";

export const getAllEvents = async (
  req: Request,
  res: Response
): Promise<void> => {
  const result = await getEvents(
    req.query.page,
    req.query.limit
  );
  res.status(200).json({
    success: true,
    events: result.events,
    data: result.events,
    ...{ page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
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
  const result = await getEventsByEntity(
    entityType,
    entityId,
    req.query.page,
    req.query.limit
  );
  res.status(200).json({
    success: true,
    entityType,
    entityId,
    events: result.events,
    data: result.events,
    ...{ page: result.page, limit: result.limit, total: result.total, totalPages: result.totalPages },
  });
};
