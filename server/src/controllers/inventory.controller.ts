import { Request, Response } from "express";
import Inventory from "../models/Inventory";
import Product from "../models/Product";
import Warehouse from "../models/Warehouse";
import { createBusinessEvent } from "../services/event.service";
import { AppError } from "../utils/AppError";
import { assertObjectId, isRecord, validationError } from "../utils/validation";

const requireActorId = (req: Request): string => {
  if (!req.user?.id) {
    throw new AppError("Authentication is required", 401, "AUTH_REQUIRED");
  }
  return req.user.id;
};

const validateCreateBody = (body: unknown) => {
  if (!isRecord(body)) {
    throw validationError({ body: "Request body must be a JSON object" });
  }
  const errors: Record<string, string> = {};
  if (typeof body.productId !== "string") errors.productId = "Product ID is required";
  if (typeof body.warehouseId !== "string") errors.warehouseId = "Warehouse ID is required";
  if (typeof body.quantity !== "number" || !Number.isFinite(body.quantity) || body.quantity < 0) {
    errors.quantity = "Quantity must be a finite number greater than or equal to 0";
  }
  if (Object.keys(body).some((field) => !["productId", "warehouseId", "quantity"].includes(field))) {
    errors.body = "Request contains unsupported fields";
  }
  if (Object.keys(errors).length) throw validationError(errors);
  return {
    productId: assertObjectId(body.productId, "product ID"),
    warehouseId: assertObjectId(body.warehouseId, "warehouse ID"),
    quantity: body.quantity as number,
  };
};

const validateUpdateBody = (body: unknown): { quantity: number } => {
  if (!isRecord(body)) {
    throw validationError({ body: "Request body must be a JSON object" });
  }
  const errors: Record<string, string> = {};
  if (!("quantity" in body)) errors.quantity = "Quantity is required";
  if ("productId" in body || "warehouseId" in body) {
    errors.body = "Product and warehouse relationships are immutable";
  }
  if (Object.keys(body).some((field) => !["quantity"].includes(field))) {
    errors.body = "Only quantity can be updated";
  }
  if (typeof body.quantity !== "number" || !Number.isFinite(body.quantity) || body.quantity < 0) {
    errors.quantity = "Quantity must be a finite number greater than or equal to 0";
  }
  if (Object.keys(errors).length) throw validationError(errors);
  return { quantity: body.quantity as number };
};

export const createInventory = async (
  req: Request,
  res: Response
): Promise<void> => {
  const actorId = requireActorId(req);
  const { productId, warehouseId, quantity } = validateCreateBody(req.body);

  const product = await Product.findById(productId);
  if (!product) throw new AppError("Product not found", 404, "PRODUCT_NOT_FOUND");
  const warehouse = await Warehouse.findById(warehouseId);
  if (!warehouse) throw new AppError("Warehouse not found", 404, "WAREHOUSE_NOT_FOUND");

  const inventory = await Inventory.create({ productId, warehouseId, quantity });
  await createBusinessEvent({
    eventType: "INVENTORY_CREATED",
    entityType: "Inventory",
    entityId: inventory._id,
    performedBy: actorId,
    payload: {
      product: { id: product._id, name: product.name, sku: product.sku },
      warehouse: { id: warehouse._id, name: warehouse.name, code: warehouse.code },
      quantity,
    },
  });
  res.status(201).json({ success: true, message: "Inventory created successfully", inventory });
};

export const getInventories = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const inventories = await Inventory.find().populate("productId").populate("warehouseId");
  res.status(200).json({ success: true, inventories });
};

export const getInventoryById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const inventory = await Inventory.findById(req.params.id)
    .populate("productId")
    .populate("warehouseId");
  if (!inventory) throw new AppError("Inventory not found", 404, "INVENTORY_NOT_FOUND");
  res.status(200).json({ success: true, inventory });
};

export const updateInventory = async (
  req: Request,
  res: Response
): Promise<void> => {
  const actorId = requireActorId(req);
  const changes = validateUpdateBody(req.body);
  const existingInventory = await Inventory.findById(req.params.id);
  if (!existingInventory) throw new AppError("Inventory not found", 404, "INVENTORY_NOT_FOUND");

  const inventory = await Inventory.findByIdAndUpdate(req.params.id, changes, {
    returnDocument: "after",
    runValidators: true,
  }).populate("productId").populate("warehouseId");
  if (!inventory) throw new AppError("Inventory not found", 404, "INVENTORY_NOT_FOUND");

  await createBusinessEvent({
    eventType: "INVENTORY_UPDATED",
    entityType: "Inventory",
    entityId: inventory._id,
    performedBy: actorId,
    payload: {
      productId: existingInventory.productId,
      warehouseId: existingInventory.warehouseId,
      previousQuantity: existingInventory.quantity,
      newQuantity: inventory.quantity,
    },
  });
  res.status(200).json({ success: true, message: "Inventory updated successfully", inventory });
};

export const deleteInventory = async (
  req: Request,
  res: Response
): Promise<void> => {
  const actorId = requireActorId(req);
  const inventory = await Inventory.findByIdAndDelete(req.params.id);
  if (!inventory) throw new AppError("Inventory not found", 404, "INVENTORY_NOT_FOUND");

  await createBusinessEvent({
    eventType: "INVENTORY_DELETED",
    entityType: "Inventory",
    entityId: inventory._id,
    performedBy: actorId,
    payload: {
      productId: inventory.productId,
      warehouseId: inventory.warehouseId,
      quantity: inventory.quantity,
    },
  });
  res.status(200).json({ success: true, message: "Inventory deleted successfully", inventory });
};
