import { Schema, Types, model } from "mongoose";
import { AppError } from "../utils/AppError";

export const SHIPMENT_DOMAIN_EVENT_TYPES = [
  "SHIPMENT_CREATED",
  "SHIPMENT_IMPORTED",
  "SHIPMENT_UPDATED",
  "SHIPMENT_DISPATCHED",
  "SHIPMENT_DELIVERED",
  "SHIPMENT_CANCELLED",
  "SHIPMENT_DELETED",
] as const;

export type ShipmentDomainEventType =
  (typeof SHIPMENT_DOMAIN_EVENT_TYPES)[number];

export interface EventMetadata {
  command?: string;
  source?: string;
  correlationId?: string;
  causationId?: string;
}

export interface ShipmentDomainEvent {
  _id: Types.ObjectId;
  aggregateId: Types.ObjectId;
  aggregateType: "Shipment";
  eventType: ShipmentDomainEventType;
  payload: Record<string, unknown>;
  timestamp: Date;
  version: number;
  performedBy: Types.ObjectId;
  metadata: EventMetadata;
}

const eventStoreSchema = new Schema<ShipmentDomainEvent>(
  {
    aggregateId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    aggregateType: {
      type: String,
      required: true,
      enum: ["Shipment"],
      immutable: true,
    },
    eventType: {
      type: String,
      required: true,
      enum: SHIPMENT_DOMAIN_EVENT_TYPES,
      immutable: true,
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
      immutable: true,
      validate: {
        validator: (value: unknown) =>
          typeof value === "object" && value !== null && !Array.isArray(value),
        message: "Event payload must be a JSON object",
      },
    },
    timestamp: {
      type: Date,
      required: true,
      default: Date.now,
      immutable: true,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
      immutable: true,
      validate: {
        validator: Number.isSafeInteger,
        message: "Event version must be a positive whole number",
      },
    },
    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      immutable: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      required: true,
      default: {},
      immutable: true,
      validate: {
        validator: (value: unknown) =>
          typeof value === "object" && value !== null && !Array.isArray(value),
        message: "Event metadata must be a JSON object",
      },
    },
  },
  { versionKey: false, strict: "throw" }
);

eventStoreSchema.index(
  { aggregateType: 1, aggregateId: 1, version: 1 },
  { unique: true, name: "uq_event_store_aggregate_version" }
);
eventStoreSchema.index(
  { eventType: 1, timestamp: 1 },
  { name: "ix_event_store_type_timestamp" }
);

const immutableError = (): AppError =>
  new AppError(
    "Event Store records are append-only",
    405,
    "EVENT_STORE_IMMUTABLE"
  );

eventStoreSchema.pre("save", function () {
  if (!this.isNew) throw immutableError();
});

eventStoreSchema.pre("deleteOne", { document: true, query: false }, function () {
  throw immutableError();
});

eventStoreSchema.pre(
  [
    "updateOne",
    "updateMany",
    "replaceOne",
    "findOneAndUpdate",
    "findOneAndReplace",
    "findOneAndDelete",
    "deleteOne",
    "deleteMany",
  ],
  function () {
    throw immutableError();
  }
);

const EventStore = model<ShipmentDomainEvent>("EventStore", eventStoreSchema);

export default EventStore;
