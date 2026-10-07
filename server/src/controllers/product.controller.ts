import { Request, Response } from "express";
import Product from "../models/Product";
import { AppError } from "../utils/AppError";
import { isRecord, validationError } from "../utils/validation";

const allowedFields = ["name", "sku", "category", "price", "quantity", "status"];
const validStatuses = ["active", "inactive"];

const validateProductBody = (body: unknown, partial: boolean): Record<string, unknown> => {
  if (!isRecord(body)) {
    throw validationError({ body: "Request body must be a JSON object" });
  }

  const errors: Record<string, string> = {};
  const values: Record<string, unknown> = {};

  for (const key of Object.keys(body)) {
    if (!allowedFields.includes(key)) errors[key] = "Field is not allowed";
    else values[key] = body[key];
  }
  if (!partial) {
    for (const key of ["name", "sku", "category", "price", "quantity"]) {
      if (!(key in body)) errors[key] = "This field is required";
    }
  } else if (Object.keys(values).length === 0) {
    errors.body = "Provide at least one product field to update";
  }

  for (const field of ["name", "sku", "category"]) {
    if (field in values && (
      typeof values[field] !== "string" ||
      !values[field].trim() ||
      values[field].trim().length > (field === "sku" ? 64 : field === "name" ? 150 : 100)
    )) {
      errors[field] = "Must be a non-empty string within the allowed length";
    }
  }
  for (const field of ["price", "quantity"]) {
    if (field in values && (
      typeof values[field] !== "number" ||
      !Number.isFinite(values[field]) ||
      values[field] < 0
    )) {
      errors[field] = "Must be a finite number greater than or equal to 0";
    }
  }
  if ("status" in values && (
    typeof values.status !== "string" ||
    !validStatuses.includes(values.status)
  )) {
    errors.status = "Must be active or inactive";
  }
  if (Object.keys(errors).length) throw validationError(errors);
  return values;
};

export const createProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  const product = await Product.create(validateProductBody(req.body, false));
  res.status(201).json({
    success: true,
    message: "Product created successfully",
    product,
  });
};

export const getProducts = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const products = await Product.find();
  res.status(200).json({ success: true, products });
};

export const getProductById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  res.status(200).json({ success: true, product });
};

export const updateProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    validateProductBody(req.body, true),
    { returnDocument: "after", runValidators: true }
  );
  if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  res.status(200).json({ success: true, message: "Product updated successfully", product });
};

export const deleteProduct = async (
  req: Request,
  res: Response
): Promise<void> => {
  const product = await Product.findByIdAndDelete(req.params.id);
  if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  res.status(200).json({ success: true, message: "Product deleted successfully", product });
};