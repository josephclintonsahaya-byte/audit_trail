import { Schema, model } from "mongoose";

const productSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 150,
    },

    sku: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      minlength: 1,
      maxlength: 64,
    },

    category: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 100,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isFinite,
    },

    quantity: {
      type: Number,
      required: true,
      min: 0,
      validate: Number.isFinite,
      default: 0,
    },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  {
    timestamps: true,
  }
);

const Product = model("Product", productSchema);

export default Product;