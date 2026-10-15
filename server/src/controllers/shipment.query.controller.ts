import { Request, Response } from "express";
import EventStore from "../models/EventStore";
import {
  getCurrentAggregateVersion,
  loadShipmentEvents,
  reconstructShipment,
  reconstructShipmentAsOf,
  validateShipmentEventSequence,
} from "../services/event-sourcing/event-store.service";
import { getShipmentProjection } from "../services/event-sourcing/shipment-projection.service";
import { AppError } from "../utils/AppError";
import { assertObjectId } from "../utils/validation";

const getVersionQuery = (req: Request): number | undefined => {
  const raw = req.query.version;
  if (raw === undefined) return undefined;
  const value = typeof raw === "string" ? Number(raw) : Number.NaN;
  return value;
};

export const getShipmentStateQuery = async (
  req: Request,
  res: Response
): Promise<void> => {
  const aggregateId = assertObjectId(String(req.params.id), "shipment ID");
  const [currentVersion, projection] = await Promise.all([
    getCurrentAggregateVersion(aggregateId),
    getShipmentProjection(aggregateId),
  ]);
  const result =
    projection && projection.version === currentVersion
      ? {
          aggregateId,
          version: projection.version,
          state: projection.state,
          eventCount: projection.version,
        }
      : await reconstructShipment(aggregateId);
  res.status(200).json({ success: true, data: result });
};

export const reconstructShipmentQuery = async (
  req: Request,
  res: Response
): Promise<void> => {
  const aggregateId = assertObjectId(String(req.params.id), "shipment ID");
  const version = getVersionQuery(req);
  const rawAt = req.query.at;
  if (rawAt !== undefined && version !== undefined) {
    throw new AppError("Specify either version or at, not both", 400, "INVALID_QUERY");
  }
  if (rawAt !== undefined) {
    if (typeof rawAt !== "string" || !rawAt.trim()) {
      throw new AppError("The at query parameter must be a valid timestamp", 400, "VALIDATION_ERROR");
    }
    const timestamp = new Date(rawAt);
    if (Number.isNaN(timestamp.getTime())) {
      throw new AppError("The at query parameter must be a valid timestamp", 400, "VALIDATION_ERROR");
    }
    const result = await reconstructShipmentAsOf(aggregateId, timestamp);
    res.status(200).json({ success: true, data: result });
    return;
  }
  const result = await reconstructShipment(aggregateId, version);
  res.status(200).json({ success: true, data: result });
};

export const getShipmentEventStreamQuery = async (
  req: Request,
  res: Response
): Promise<void> => {
  const aggregateId = assertObjectId(String(req.params.id), "shipment ID");
  const events = await loadShipmentEvents(aggregateId);
  if (events.length === 0) {
    throw new AppError("Event-sourced shipment not found", 404, "SHIPMENT_NOT_FOUND");
  }
  validateShipmentEventSequence(events);
  res.status(200).json({
    success: true,
    aggregateId,
    events: events.map((event) => ({
      id: String(event._id),
      aggregateId: String(event.aggregateId),
      aggregateType: event.aggregateType,
      version: event.version,
      eventType: event.eventType,
      timestamp: event.timestamp,
      performedBy: String(event.performedBy),
      payload: event.payload,
      metadata: event.metadata,
    })),
  });
};
