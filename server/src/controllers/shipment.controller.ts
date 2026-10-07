import { Request, Response } from "express";
import {
  CreateShipmentInput,
  ShipmentItemInput,
  cancelShipment,
  createShipment,
  deleteDraftShipment,
  deliverShipment,
  dispatchShipment,
  getShipment,
  listShipments,
  updateDraftShipment,
} from "../services/shipment.service";
import { AppError } from "../utils/AppError";
import { assertObjectId, isRecord, validationError } from "../utils/validation";

const requireActorId = (req: Request): string => {
  if (!req.user?.id) {
    throw new AppError("Authentication is required", 401, "AUTH_REQUIRED");
  }
  return assertObjectId(req.user.id, "authenticated user ID");
};

const parseShipmentInput = (
  body: unknown,
  partial = false
): Partial<CreateShipmentInput> => {
  if (!isRecord(body)) {
    throw validationError({ body: "Request body must be a JSON object" });
  }
  const errors: Record<string, string> = {};
  const allowed = ["sourceWarehouseId", "destinationWarehouseId", "items"];
  for (const field of Object.keys(body)) {
    if (!allowed.includes(field)) errors[field] = "Field is not allowed";
  }
  if (!partial) {
    for (const field of allowed) {
      if (!(field in body)) errors[field] = "This field is required";
    }
  } else if (!Object.keys(body).some((field) => allowed.includes(field))) {
    errors.body = "Provide at least one shipment field to update";
  }

  const result: Partial<CreateShipmentInput> = {};
  if ("sourceWarehouseId" in body) {
    if (typeof body.sourceWarehouseId !== "string") {
      errors.sourceWarehouseId = "Source warehouse ID is required";
    } else {
      result.sourceWarehouseId = assertObjectId(body.sourceWarehouseId, "source warehouse ID");
    }
  }
  if ("destinationWarehouseId" in body) {
    if (typeof body.destinationWarehouseId !== "string") {
      errors.destinationWarehouseId = "Destination warehouse ID is required";
    } else {
      result.destinationWarehouseId = assertObjectId(
        body.destinationWarehouseId,
        "destination warehouse ID"
      );
    }
  }
  if ("items" in body) {
    if (!Array.isArray(body.items) || body.items.length === 0) {
      errors.items = "At least one shipment item is required";
    } else {
      const items: ShipmentItemInput[] = [];
      body.items.forEach((item, index) => {
        if (!isRecord(item)) {
          errors[`items.${index}`] = "Item must be a JSON object";
          return;
        }
        if (Object.keys(item).some((field) => !["productId", "quantity"].includes(field))) {
          errors[`items.${index}`] = "Item contains unsupported fields";
        }
        if (typeof item.productId !== "string") {
          errors[`items.${index}.productId`] = "Product ID is required";
        } else {
          items[index] = {
            productId: assertObjectId(item.productId, "product ID"),
            quantity: typeof item.quantity === "number" ? item.quantity : Number.NaN,
          };
        }
        if (
          typeof item.quantity !== "number" ||
          !Number.isSafeInteger(item.quantity) ||
          item.quantity <= 0
        ) {
          errors[`items.${index}.quantity`] = "Quantity must be a positive whole number";
        }
      });
      result.items = items;
    }
  }
  if (Object.keys(errors).length) throw validationError(errors);
  return result;
};

export const createShipmentHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const actorId = requireActorId(req);
  const input = parseShipmentInput(req.body) as CreateShipmentInput;
  if (input.sourceWarehouseId === input.destinationWarehouseId) {
    throw validationError({ destinationWarehouseId: "Must differ from the source warehouse" });
  }
  const shipment = await createShipment(input, actorId);
  res.status(201).json({ success: true, message: "Shipment created successfully", shipment });
};

export const getShipments = async (
  _req: Request,
  res: Response
): Promise<void> => {
  const shipments = await listShipments();
  res.status(200).json({ success: true, shipments });
};

export const getShipmentById = async (
  req: Request,
  res: Response
): Promise<void> => {
  const shipment = await getShipment(String(req.params.id));
  res.status(200).json({ success: true, shipment });
};

export const updateShipment = async (
  req: Request,
  res: Response
): Promise<void> => {
  const actorId = requireActorId(req);
  const changes = parseShipmentInput(req.body, true);
  if (
    changes.sourceWarehouseId &&
    changes.destinationWarehouseId &&
    changes.sourceWarehouseId === changes.destinationWarehouseId
  ) {
    throw validationError({ destinationWarehouseId: "Must differ from the source warehouse" });
  }
  const shipment = await updateDraftShipment(String(req.params.id), changes, actorId);
  res.status(200).json({ success: true, message: "Shipment updated successfully", shipment });
};

export const deleteShipment = async (
  req: Request,
  res: Response
): Promise<void> => {
  const actorId = requireActorId(req);
  await deleteDraftShipment(String(req.params.id), actorId);
  res.status(200).json({ success: true, message: "Shipment deleted successfully" });
};

const runShipmentAction = async (
  req: Request,
  res: Response,
  operation: "dispatch" | "deliver" | "cancel"
): Promise<void> => {
  const actorId = requireActorId(req);
  const shipmentId = String(req.params.id);
  const shipment =
    operation === "dispatch"
      ? await dispatchShipment(shipmentId, actorId)
      : operation === "deliver"
        ? await deliverShipment(shipmentId, actorId)
        : await cancelShipment(shipmentId, actorId);
  res.status(200).json({
    success: true,
    message: `Shipment ${operation === "cancel" ? "cancelled" : `${operation}ed`} successfully`,
    shipment,
  });
};

export const dispatchShipmentHandler = (req: Request, res: Response) =>
  runShipmentAction(req, res, "dispatch");

export const deliverShipmentHandler = (req: Request, res: Response) =>
  runShipmentAction(req, res, "deliver");

export const cancelShipmentHandler = (req: Request, res: Response) =>
  runShipmentAction(req, res, "cancel");
