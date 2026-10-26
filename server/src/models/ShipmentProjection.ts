import { Schema, Types, model } from "mongoose";
import { ShipmentAggregateState } from "../services/event-sourcing/shipment.reducer";

export interface ShipmentProjectionRecord {
  aggregateId: Types.ObjectId;
  version: number;
  lastEventId: Types.ObjectId;
  state: ShipmentAggregateState;
  projectedAt: Date;
}

const shipmentProjectionSchema = new Schema<ShipmentProjectionRecord>(
  {
    aggregateId: {
      type: Schema.Types.ObjectId,
      required: true,
      immutable: true,
    },
    version: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: "Projection version must be a positive whole number",
      },
    },
    lastEventId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    state: {
      type: Schema.Types.Mixed,
      required: true,
    },
    projectedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { versionKey: false }
);

shipmentProjectionSchema.index(
  { aggregateId: 1 },
  { unique: true, name: "uq_shipment_projection_aggregate" }
);

const ShipmentProjection = model<ShipmentProjectionRecord>(
  "ShipmentProjection",
  shipmentProjectionSchema
);

export default ShipmentProjection;
