import mongoose, { ClientSession, Types } from "mongoose";
import EventStore, {
  EventMetadata,
  ShipmentDomainEvent,
  ShipmentDomainEventType,
} from "../../models/EventStore";
import Shipment from "../../models/Shipment";
import User from "../../models/User";
import { AppError } from "../../utils/AppError";
import { assertObjectId, isRecord, validationError } from "../../utils/validation";
import {
  ShipmentAggregateState,
  replayShipmentEvents,
} from "./shipment.reducer";

export interface AppendEventInput {
  aggregateId: string | Types.ObjectId;
  aggregateType: "Shipment";
  eventType: ShipmentDomainEventType;
  payload: Record<string, unknown>;
  performedBy: string | Types.ObjectId;
  expectedVersion: number;
  metadata?: EventMetadata;
  session?: ClientSession;
}

const validateShipmentEventPayload = (
  eventType: ShipmentDomainEventType,
  payload: Record<string, unknown>
): void => {
  const errors: Record<string, string> = {};
  for (const field of ["shipmentNumber", "sourceWarehouseId", "destinationWarehouseId", "createdBy"]) {
    if (typeof payload[field] !== "string" || !payload[field]) {
      errors[field] = "This field is required";
    }
  }
  if (typeof payload.shipmentNumber === "string" && payload.shipmentNumber.length > 64) {
    errors.shipmentNumber = "Must be at most 64 characters";
  }
  for (const field of ["sourceWarehouseId", "destinationWarehouseId", "createdBy"]) {
    if (typeof payload[field] === "string") {
      try {
        assertObjectId(payload[field], field);
      } catch {
        errors[field] = "Must be a valid ObjectId";
      }
    }
  }
  if (
    typeof payload.sourceWarehouseId === "string" &&
    payload.sourceWarehouseId === payload.destinationWarehouseId
  ) {
    errors.destinationWarehouseId = "Must differ from the source warehouse";
  }
  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    errors.items = "At least one shipment item is required";
  } else {
    payload.items.forEach((item, index) => {
      if (
        typeof item !== "object" ||
        item === null ||
        !("productId" in item) ||
        typeof item.productId !== "string" ||
        !("quantity" in item) ||
        typeof item.quantity !== "number" ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        errors[`items.${index}`] = "Product ID and positive whole-number quantity are required";
      } else {
        try {
          assertObjectId(item.productId, "product ID");
        } catch {
          errors[`items.${index}.productId`] = "Must be a valid ObjectId";
        }
      }
    });
  }

  const requiredStatus: Partial<Record<ShipmentDomainEventType, string>> = {
    SHIPMENT_CREATED: "CREATED",
    SHIPMENT_DISPATCHED: "IN_TRANSIT",
    SHIPMENT_DELIVERED: "DELIVERED",
    SHIPMENT_CANCELLED: "CANCELLED",
  };
  if (eventType === "SHIPMENT_IMPORTED") {
    if (
      payload.status !== "CREATED" &&
      payload.status !== "IN_TRANSIT" &&
      payload.status !== "DELIVERED" &&
      payload.status !== "CANCELLED"
    ) {
      errors.status = "Imported shipment status is invalid";
    }
  } else if (
    requiredStatus[eventType] &&
    payload.status !== requiredStatus[eventType]
  ) {
    errors.status = `Must be ${requiredStatus[eventType]}`;
  }
  if (Object.keys(errors).length) throw validationError(errors);
};

const toObjectId = (value: string | Types.ObjectId, label: string) =>
  value instanceof Types.ObjectId ? value : new Types.ObjectId(assertObjectId(value, label));

const readCurrentVersion = async (
  aggregateId: Types.ObjectId,
  session?: ClientSession
): Promise<number> => {
  let query = EventStore.findOne({ aggregateType: "Shipment", aggregateId })
    .sort({ version: -1 })
    .select({ version: 1 });
  if (session) query = query.session(session);
  const latest = await query.lean().exec();
  return latest?.version ?? 0;
};

export const getCurrentAggregateVersion = (
  aggregateIdValue: string | Types.ObjectId,
  session?: ClientSession
): Promise<number> =>
  readCurrentVersion(toObjectId(aggregateIdValue, "aggregate ID"), session);

const appendWithinTransaction = async (
  input: AppendEventInput,
  session: ClientSession
): Promise<ShipmentDomainEvent> => {
  const errors: Record<string, string> = {};
  if (!Number.isSafeInteger(input.expectedVersion) || input.expectedVersion < 0) {
    errors.expectedVersion = "Must be a non-negative whole number";
  }
  if (!isRecord(input.payload)) errors.payload = "Must be a JSON object";
  if (input.aggregateType !== "Shipment") errors.aggregateType = "Unsupported aggregate type";
  if (!input.eventType) errors.eventType = "Event type is required";
  if (input.metadata !== undefined && !isRecord(input.metadata)) {
    errors.metadata = "Must be a JSON object";
  }
  if (Object.keys(errors).length) throw validationError(errors);
  validateShipmentEventPayload(input.eventType, input.payload);

  const aggregateId = toObjectId(input.aggregateId, "aggregate ID");
  const performedBy = toObjectId(input.performedBy, "performer ID");
  const aggregateExists = await Shipment.exists({ _id: aggregateId }).session(session);
  if (!aggregateExists) {
    throw new AppError("Shipment aggregate not found", 404, "SHIPMENT_NOT_FOUND");
  }
  const performerExists = await User.exists({ _id: performedBy }).session(session);
  if (!performerExists) {
    throw new AppError("Event performer not found", 400, "INVALID_PERFORMER");
  }
  const currentVersion = await readCurrentVersion(aggregateId, session);
  if (input.expectedVersion !== currentVersion) {
    throw new AppError(
      "Aggregate version conflict",
      409,
      "CONCURRENCY_CONFLICT",
      { expectedVersion: String(input.expectedVersion), currentVersion: String(currentVersion) }
    );
  }

  const [event] = await EventStore.create(
    [{
      aggregateId,
      aggregateType: input.aggregateType,
      eventType: input.eventType,
      payload: input.payload,
      timestamp: new Date(),
      version: currentVersion + 1,
      performedBy,
      metadata: input.metadata ?? {},
    }],
    { session }
  );
  return event;
};

const isDuplicateKeyError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === 11000;

export const appendEvent = async (
  input: AppendEventInput
): Promise<ShipmentDomainEvent> => {
  try {
    if (input.session) return await appendWithinTransaction(input, input.session);
    return await mongoose.connection.transaction((session) =>
      appendWithinTransaction(input, session)
    );
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new AppError(
        "Aggregate version conflict",
        409,
        "CONCURRENCY_CONFLICT"
      );
    }
    throw error;
  }
};

export const loadShipmentEvents = async (
  aggregateIdValue: string | Types.ObjectId,
  options: { throughVersion?: number; session?: ClientSession } = {}
): Promise<ShipmentDomainEvent[]> => {
  const aggregateId = toObjectId(aggregateIdValue, "shipment ID");
  let query = EventStore.find({
    aggregateType: "Shipment",
    aggregateId,
    ...(options.throughVersion === undefined
      ? {}
      : { version: { $lte: options.throughVersion } }),
  }).sort({ version: 1 });
  if (options.session) query = query.session(options.session);
  return query.exec();
};

export const validateShipmentEventSequence = (
  events: ShipmentDomainEvent[]
): void => {
  for (let index = 0; index < events.length; index += 1) {
    if (events[index].version !== index + 1) {
      throw new AppError(
        "Shipment event stream has a version gap",
        500,
        "EVENT_STREAM_CORRUPTED"
      );
    }
  }
};

export const reconstructShipment = async (
  aggregateId: string,
  throughVersion?: number
): Promise<{
  aggregateId: string;
  version: number;
  state: ShipmentAggregateState;
  eventCount: number;
}> => {
  const validId = assertObjectId(aggregateId, "shipment ID");
  if (
    throughVersion !== undefined &&
    (!Number.isSafeInteger(throughVersion) || throughVersion < 1)
  ) {
    throw validationError({ version: "Must be a positive whole number" });
  }

  const latestVersion = await readCurrentVersion(new Types.ObjectId(validId));
  if (latestVersion === 0) {
    throw new AppError("Event-sourced shipment not found", 404, "SHIPMENT_NOT_FOUND");
  }
  if (throughVersion !== undefined && throughVersion > latestVersion) {
    throw new AppError("Requested shipment version does not exist", 404, "VERSION_NOT_FOUND");
  }

  const events = await loadShipmentEvents(validId, { throughVersion });
  validateShipmentEventSequence(events);
  if (
    throughVersion !== undefined &&
    events[events.length - 1]?.version !== throughVersion
  ) {
    throw new AppError(
      "Requested shipment version does not exist",
      404,
      "VERSION_NOT_FOUND"
    );
  }
  const state = replayShipmentEvents(events);
  if (!state) {
    throw new AppError("Shipment event stream is empty", 500, "EVENT_STREAM_CORRUPTED");
  }
  return {
    aggregateId: validId,
    version: events[events.length - 1].version,
    state,
    eventCount: events.length,
  };
};

export const assertExpectedVersion = async (
  aggregateId: Types.ObjectId,
  expectedVersion: number,
  session: ClientSession
): Promise<number> => {
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw validationError({ expectedVersion: "Must be a non-negative whole number" });
  }
  const currentVersion = await readCurrentVersion(aggregateId, session);
  if (currentVersion !== expectedVersion) {
    throw new AppError(
      "Aggregate version conflict",
      409,
      "CONCURRENCY_CONFLICT",
      { expectedVersion: String(expectedVersion), currentVersion: String(currentVersion) }
    );
  }
  return currentVersion;
};
