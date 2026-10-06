import { Schema, model } from "mongoose";

const eventSchema = new Schema(
  {
    eventType: {
      type: String,
      required: true,
      trim: true,
    },

    entityType: {
      type: String,
      required: true,
      trim: true,
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
    },
  },
  {
    timestamps: true,
  }
);

const Event = model("Event", eventSchema);

export default Event;