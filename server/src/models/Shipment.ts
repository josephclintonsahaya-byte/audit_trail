import { InferSchemaType, Schema, Types, model } from "mongoose";

export const SHIPMENT_STATUSES = [
  "CREATED",
  "IN_TRANSIT",
  "DELIVERED",
  "CANCELLED",
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

const shipmentItemSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isInteger,
        message: "Shipment quantity must be a whole number",
      },
    },
  },
  { _id: false }
);

const shipmentSchema = new Schema(
  {
    shipmentNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 1,
      maxlength: 64,
    },
    sourceWarehouseId: {
      type: Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
    },
    destinationWarehouseId: {
      type: Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
    },
    items: {
      type: [shipmentItemSchema],
      required: true,
      validate: {
        validator: (items: unknown[]) => items.length > 0,
        message: "A shipment must contain at least one item",
      },
    },
    status: {
      type: String,
      enum: SHIPMENT_STATUSES,
      default: "CREATED",
      required: true,
    },
    version: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: "Shipment version must be a non-negative whole number",
      },
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

shipmentSchema.pre("validate", function () {
  if (
    this.sourceWarehouseId &&
    this.destinationWarehouseId &&
    this.sourceWarehouseId.equals(this.destinationWarehouseId)
  ) {
    this.invalidate(
      "destinationWarehouseId",
      "Source and destination warehouses must be different"
    );
  }
});

shipmentSchema.index({ status: 1 });
shipmentSchema.index({ createdAt: -1 });

export const createShipmentNumber = (): string =>
  `SHP-${new Types.ObjectId().toHexString().toUpperCase()}`;

type ShipmentRecord = InferSchemaType<typeof shipmentSchema>;
const Shipment = model<ShipmentRecord>("Shipment", shipmentSchema);

export default Shipment;
