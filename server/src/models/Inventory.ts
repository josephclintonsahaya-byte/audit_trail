import { Schema, model } from "mongoose";

const inventorySchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    warehouseId: {
      type: Schema.Types.ObjectId,
      ref: "Warehouse",
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
      validate: Number.isFinite,
    },
  },
  {
    timestamps: true,
  }
);

inventorySchema.index(
  { productId: 1, warehouseId: 1 },
  { unique: true }
);

const Inventory = model("Inventory", inventorySchema);

export default Inventory;