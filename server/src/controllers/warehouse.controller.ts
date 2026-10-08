import { Request, Response } from "express";
import Inventory from "../models/Inventory";
import Warehouse from "../models/Warehouse";
import { AppError } from "../utils/AppError";
import { isRecord, validationError } from "../utils/validation";

const allowedFields = ["name", "code", "location", "status"];

const validateWarehouseBody = (
  body: unknown,
  partial: boolean
): Record<string, unknown> => {
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
    for (const key of ["name", "code", "location"]) {
      if (!(key in body)) errors[key] = "This field is required";
    }
  } else if (Object.keys(values).length === 0) {
    errors.body = "Provide at least one warehouse field to update";
  }

  for (const field of ["name", "code", "location"]) {
    const maxLength = field === "location" ? 200 : field === "name" ? 150 : 64;
    if (field in values && (
      typeof values[field] !== "string" ||
      !values[field].trim() ||
      values[field].trim().length > maxLength
    )) {
      errors[field] = "Must be a non-empty string within the allowed length";
    }
  }
  if ("status" in values && values.status !== "active" && values.status !== "inactive") {
    errors.status = "Must be active or inactive";
  }
  if (Object.keys(errors).length) throw validationError(errors);
  return values;
};

export const createWarehouse = async (
  req: Request,
  res: Response
): Promise<void> => {
  const warehouse = await Warehouse.create(validateWarehouseBody(req.body, false));
  res.status(201).json({ success: true, message: "Warehouse created successfully", warehouse });
};

export const getWarehouses = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const warehouses = await Warehouse.find();
  res.status(200).json({ success: true, warehouses });
};

export const getWarehouseById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const warehouse = await Warehouse.findById(req.params.id);
  if (!warehouse) throw new AppError("Warehouse not found", 404, "WAREHOUSE_NOT_FOUND");
  res.status(200).json({ success: true, warehouse });
};

export const updateWarehouse = async (
  req: Request,
  res: Response
): Promise<void> => {
  const warehouse = await Warehouse.findByIdAndUpdate(
    req.params.id,
    validateWarehouseBody(req.body, true),
    { returnDocument: "after", runValidators: true }
  );
  if (!warehouse) throw new AppError("Warehouse not found", 404, "WAREHOUSE_NOT_FOUND");
  res.status(200).json({ success: true, message: "Warehouse updated successfully", warehouse });
};

export const deleteWarehouse = async (
  req: Request,
  res: Response
): Promise<void> => {
  const inventoryReference = await Inventory.exists({ warehouseId: req.params.id });
  if (inventoryReference) {
    throw new AppError(
      "Warehouse is referenced by inventory and cannot be deleted",
      409,
      "WAREHOUSE_IN_USE"
    );
  }
  const warehouse = await Warehouse.findByIdAndDelete(req.params.id);
  if (!warehouse) throw new AppError("Warehouse not found", 404, "WAREHOUSE_NOT_FOUND");
  res.status(200).json({ success: true, message: "Warehouse deleted successfully", warehouse });
};