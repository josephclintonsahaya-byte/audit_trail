import { ErrorRequestHandler } from "express";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { AppError } from "../utils/AppError";

const isMalformedJsonError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "type" in error &&
  error.type === "entity.parse.failed";

const isPayloadTooLargeError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "type" in error &&
  error.type === "entity.too.large";

export const errorHandler: ErrorRequestHandler = (
  error,
  _req,
  res,
  _next
) => {
  if (res.headersSent) {
    _next(error);
    return;
  }

  if (isMalformedJsonError(error)) {
    res.status(400).json({
      success: false,
      message: "Request body contains invalid JSON",
      code: "INVALID_JSON",
    });
    return;
  }

  if (isPayloadTooLargeError(error)) {
    res.status(413).json({
      success: false,
      message: "Request body is too large",
      code: "PAYLOAD_TOO_LARGE",
    });
    return;
  }

  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
      code: error.code,
      ...(error.details ? { errors: error.details } : {}),
    });
    return;
  }

  if (error instanceof mongoose.Error.ValidationError) {
    const errors = Object.fromEntries(
      Object.entries(error.errors).map(([field, validation]) => [
        field,
        validation.kind === "required"
          ? "This field is required"
          : validation.kind === "min"
            ? "Value is below the allowed minimum"
            : validation.kind === "max"
              ? "Value is above the allowed maximum"
              : "Value is invalid",
      ])
    );
    res.status(400).json({
      success: false,
      message: "Validation failed",
      code: "VALIDATION_ERROR",
      errors,
    });
    return;
  }

  if (error instanceof mongoose.Error.CastError) {
    res.status(400).json({
      success: false,
      message: "Invalid identifier or value",
      code: error.kind === "ObjectId" ? "INVALID_ID" : "INVALID_VALUE",
    });
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000
  ) {
    const fields = Object.keys(
      "keyPattern" in error && typeof error.keyPattern === "object" && error.keyPattern
        ? error.keyPattern
        : "keyValue" in error && typeof error.keyValue === "object" && error.keyValue
          ? error.keyValue
          : {}
    );
    const duplicate = fields.includes("email")
      ? { message: "Email already exists", code: "USER_EMAIL_TAKEN" }
      : fields.includes("sku")
        ? { message: "SKU already exists", code: "PRODUCT_SKU_TAKEN" }
        : fields.includes("code")
          ? { message: "Warehouse code already exists", code: "WAREHOUSE_CODE_TAKEN" }
          : fields.includes("productId") && fields.includes("warehouseId")
            ? {
                message: "Inventory already exists for this product and warehouse",
                code: "INVENTORY_ALREADY_EXISTS",
              }
            : fields.includes("shipmentNumber")
              ? { message: "Shipment number already exists", code: "SHIPMENT_NUMBER_TAKEN" }
              : { message: "A record with these details already exists", code: "DUPLICATE_RECORD" };
    res.status(409).json({ success: false, ...duplicate });
    return;
  }

  if (error instanceof jwt.TokenExpiredError) {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      code: "TOKEN_EXPIRED",
    });
    return;
  }

  if (error instanceof jwt.JsonWebTokenError) {
    res.status(401).json({
      success: false,
      message: "Invalid or expired token",
      code: "INVALID_TOKEN",
    });
    return;
  }

  console.error("Unhandled request error:", error);
  res.status(500).json({
    success: false,
    message: "Internal server error",
    code: "INTERNAL_SERVER_ERROR",
  });
};
