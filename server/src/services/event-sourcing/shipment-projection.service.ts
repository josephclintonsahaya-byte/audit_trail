import { Types } from "mongoose";
import EventStore, { ShipmentDomainEvent } from "../../models/EventStore";
import ShipmentProjection from "../../models/ShipmentProjection";
import { AppError } from "../../utils/AppError";
import { assertObjectId } from "../../utils/validation";
import { applyShipmentEvent } from "./shipment.reducer";

const loggedProjectionFailures = new Set<string>();

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

export const projectShipmentEvent = async (
  event: ShipmentDomainEvent
): Promise<boolean> => {
  if (event.aggregateType !== "Shipment") {
    return false;
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existing = await ShipmentProjection.findOne({
      aggregateId: event.aggregateId,
    })
      .lean()
      .exec();
    const currentVersion = existing?.version ?? 0;

    if (event.version <= currentVersion) return false;
    if (event.version !== currentVersion + 1) {
      throw new AppError(
        "Shipment projection encountered an event version gap",
        500,
        "PROJECTION_VERSION_GAP",
        {
          aggregateId: String(event.aggregateId),
          expectedVersion: String(currentVersion + 1),
          eventVersion: String(event.version),
        },
      );
    }

    const state = applyShipmentEvent(existing?.state ?? null, event);
    try {
      const result = await ShipmentProjection.updateOne(
        { aggregateId: event.aggregateId, version: currentVersion },
        {
          $set: {
            version: event.version,
            lastEventId: event._id,
            state,
            projectedAt: new Date(),
          },
          $setOnInsert: { aggregateId: event.aggregateId },
        },
        { upsert: currentVersion === 0, runValidators: true }
      ).exec();
      if (result.matchedCount > 0 || result.upsertedCount > 0) return true;
    } catch (error) {
      if (!isDuplicateKeyError(error)) throw error;
    }
  }

  const concurrentProjection = await ShipmentProjection.findOne({
    aggregateId: event.aggregateId,
  })
    .select({ version: 1 })
    .lean()
    .exec();
  if (concurrentProjection && concurrentProjection.version >= event.version) {
    return false;
  }
  throw new AppError(
    "Shipment projection could not apply an event after concurrent updates",
    500,
    "PROJECTION_CONCURRENT_UPDATE",
    { aggregateId: String(event.aggregateId), eventVersion: String(event.version) }
  );
};

export const projectShipmentAggregateEvents = async (
  aggregateIdValue: string | Types.ObjectId
): Promise<number> => {
  const aggregateId =
    aggregateIdValue instanceof Types.ObjectId
      ? aggregateIdValue
      : new Types.ObjectId(assertObjectId(aggregateIdValue, "shipment ID"));
  const projection = await ShipmentProjection.findOne({ aggregateId })
    .select({ version: 1 })
    .lean()
    .exec();
  const events = await EventStore.find({
    aggregateType: "Shipment",
    aggregateId,
    version: { $gt: projection?.version ?? 0 },
  })
    .sort({ version: 1 })
    .exec();

  let processed = 0;
  for (const event of events) {
    if (await projectShipmentEvent(event)) processed += 1;
  }
  return processed;
};

export const projectPendingShipmentEvents = async (
  limit = 100
): Promise<number> => {
 const pendingEvents = await EventStore.aggregate<ShipmentDomainEvent>([
  {
    $match: { aggregateType: "Shipment" },
  },
  {
    $lookup: {
      from: ShipmentProjection.collection.name,
      localField: "aggregateId",
      foreignField: "aggregateId",
      as: "projection",
    },
  },
  {
    $match: {
      $expr: {
        $or: [
          { $eq: [{ $size: "$projection" }, 0] },
          {
            $gt: [
              "$version",
              { $arrayElemAt: ["$projection.version", 0] },
            ],
          },
        ],
      },
    },
  },
  { $sort: { aggregateId: 1, version: 1 } },
  { $limit: limit },
  { $project: { projection: 0 } },
]).exec();

  let processed = 0;
  for (const event of pendingEvents) {
    const failureKey = `${event.aggregateId}:${event.version}`;
    try {
      if (await projectShipmentEvent(event)) processed += 1;
      loggedProjectionFailures.delete(failureKey);
    } catch (error) {
      if (!loggedProjectionFailures.has(failureKey)) {
        console.error(JSON.stringify({
          level: "error",
          event: "shipment_projection.event_failed",
          operation: "project_event",
          aggregateType: event.aggregateType,
          aggregateId: String(event.aggregateId),
          eventId: String(event._id),
          eventType: event.eventType,
          eventVersion: event.version,
          ...(typeof event.metadata?.correlationId === "string"
            ? { correlationId: event.metadata.correlationId.slice(0, 128) }
            : {}),
          errorType: error instanceof Error ? error.name : "UnknownError",
          retrying: true,
        }));
        loggedProjectionFailures.add(failureKey);
        if (loggedProjectionFailures.size > 1000) {
          const oldestFailure = loggedProjectionFailures.values().next().value;
          if (oldestFailure) loggedProjectionFailures.delete(oldestFailure);
        }
      }
    }
  }
  return processed;
};

export const getShipmentProjection = (aggregateId: string) =>
  ShipmentProjection.findOne({
    aggregateId: new Types.ObjectId(assertObjectId(aggregateId, "shipment ID")),
  })
    .lean()
    .exec();
