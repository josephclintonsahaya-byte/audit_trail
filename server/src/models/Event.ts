import { Schema, model } from "mongoose";

const eventSchema = new Schema(
  {
    eventType: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },

    entityType: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },

    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
    },

    performedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    payload: {
      type: Schema.Types.Mixed,
      default: {},
      validate: {
        validator: (payload: unknown) =>
          typeof payload === "object" && payload !== null && !Array.isArray(payload),
        message: "Event payload must be an object",
      },
    },
  },
  {
    timestamps: true,
  }
);

// Supports per-entity history and newest/oldest ordering without a collection sort.
eventSchema.index({ entityType: 1, entityId: 1, createdAt: -1, _id: -1 });
// Supports the default audit feed ordering and event-type filtering.
eventSchema.index({ eventType: 1, createdAt: -1, _id: -1 });
eventSchema.index({ createdAt: -1, _id: -1 });

const Event = model("Event", eventSchema);

export default Event;
