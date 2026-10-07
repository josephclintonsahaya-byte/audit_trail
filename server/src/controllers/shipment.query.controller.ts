import { Request, Response } from "express";
import EventStore from "../models/EventStore";
import {
  loadShipmentEvents,
  reconstructShipment,
  validateShipmentEventSequence,
} from "../services/event-sourcing/event-store.service";
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
  const result = await reconstructShipment(aggregateId);
  res.status(200).json({ success: true, data: result });
};

export const reconstructShipmentQuery = async (
  req: Request,
  res: Response
): Promise<void> => {
  const aggregateId = assertObjectId(String(req.params.id), "shipment ID");
  const result = await reconstructShipment(aggregateId, getVersionQuery(req));
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
