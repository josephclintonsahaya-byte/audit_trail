import { Request, Response } from "express";
import { CreateShipmentInput, ShipmentItemInput } from "../services/shipment.service";
import {
  cancelShipmentCommand,
  createShipmentCommand,
  deliverShipmentCommand,
  dispatchShipmentCommand,
} from "../services/event-sourcing/shipment.commands.service";
import { AppError } from "../utils/AppError";
import { assertObjectId, isRecord, validationError } from "../utils/validation";

const getActorId = (req: Request): string => {
  if (!req.user?.id) {
    throw new AppError("Authentication is required", 401, "AUTH_REQUIRED");
  }
  return assertObjectId(req.user.id, "authenticated user ID");
};

const getCommandContext = (req: Request) => ({
  performedBy: getActorId(req),
  ...(req.header("x-correlation-id")
    ? { correlationId: req.header("x-correlation-id")!.slice(0, 128) }
    : {}),
});

const checkAllowedKeys = (
  body: Record<string, unknown>,
  fields: string[]
): Record<string, string> => {
  const errors: Record<string, string> = {};
  for (const key of Object.keys(body)) {
    if (!fields.includes(key)) errors[key] = "Field is not allowed";
  }
  return errors;
};

const parseExpectedVersion = (
  body: Record<string, unknown>,
  initial = false
): number => {
  if (
    !Number.isSafeInteger(body.expectedVersion) ||
    typeof body.expectedVersion !== "number" ||
    body.expectedVersion < (initial ? 0 : 1) ||
    (initial && body.expectedVersion !== 0)
  ) {
    throw validationError({
      expectedVersion: initial
        ? "New shipments must start at expectedVersion 0"
        : "Must be a positive whole number",
    });
  }
  return body.expectedVersion;
};

const parseCreateCommand = (body: unknown): CreateShipmentInput => {
  if (!isRecord(body)) {
    throw validationError({ body: "Request body must be a JSON object" });
  }
  const errors = checkAllowedKeys(body, [
    "sourceWarehouseId",
    "destinationWarehouseId",
    "items",
    "expectedVersion",
  ]);
  try {
    parseExpectedVersion(body, true);
  } catch (error) {
    if (error instanceof AppError && error.details) Object.assign(errors, error.details);
    else throw error;
  }

  const parseId = (field: "sourceWarehouseId" | "destinationWarehouseId"): string => {
    if (typeof body[field] !== "string") {
      errors[field] = "This field is required";
      return "";
    }
    try {
      return assertObjectId(body[field], field);
    } catch {
      errors[field] = "Must be a valid ObjectId";
      return "";
    }
  };
  const sourceWarehouseId = parseId("sourceWarehouseId");
  const destinationWarehouseId = parseId("destinationWarehouseId");

  const items: ShipmentItemInput[] = [];
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.items = "At least one shipment item is required";
  } else {
    body.items.forEach((item, index) => {
      if (!isRecord(item)) {
        errors[`items.${index}`] = "Item must be a JSON object";
        return;
      }
      if (Object.keys(item).some((key) => !["productId", "quantity"].includes(key))) {
        errors[`items.${index}`] = "Item contains unsupported fields";
      }
      if (typeof item.productId !== "string") {
        errors[`items.${index}.productId`] = "Product ID is required";
      } else {
        try {
          items[index] = {
            productId: assertObjectId(item.productId, "product ID"),
            quantity: typeof item.quantity === "number" ? item.quantity : Number.NaN,
          };
        } catch {
          errors[`items.${index}.productId`] = "Must be a valid ObjectId";
        }
      }
      if (
        typeof item.quantity !== "number" ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity <= 0
      ) {
        errors[`items.${index}.quantity`] = "Must be a positive whole number";
      }
    });
  }
  if (sourceWarehouseId && sourceWarehouseId === destinationWarehouseId) {
    errors.destinationWarehouseId = "Must differ from the source warehouse";
  }
  if (Object.keys(errors).length) throw validationError(errors);
  return { sourceWarehouseId, destinationWarehouseId, items };
};

const parseExistingAggregateCommand = (
  body: unknown
): { shipmentId: string; expectedVersion: number } => {
  if (!isRecord(body)) {
    throw validationError({ body: "Request body must be a JSON object" });
  }
  const errors = checkAllowedKeys(body, ["shipmentId", "expectedVersion"]);
  let shipmentId = "";
  if (typeof body.shipmentId !== "string") {
    errors.shipmentId = "Shipment ID is required";
  } else {
    try {
      shipmentId = assertObjectId(body.shipmentId, "shipment ID");
    } catch {
      errors.shipmentId = "Must be a valid ObjectId";
    }
  }
  let expectedVersion = 0;
  try {
    expectedVersion = parseExpectedVersion(body);
  } catch (error) {
    if (error instanceof AppError && error.details) Object.assign(errors, error.details);
    else throw error;
  }
  if (Object.keys(errors).length) throw validationError(errors);
  return { shipmentId, expectedVersion };
};

const respondWithCommand = (
  res: Response,
  result: Awaited<ReturnType<typeof createShipmentCommand>>,
  message: string
): void => {
  res.status(200).json({
    success: true,
    message,
    data: {
      aggregateId: result.aggregateId,
      version: result.version,
      state: result.state,
      eventCount: result.eventCount,
      shipment: result.shipment,
    },
  });
};

export const createShipmentCommandHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const input = parseCreateCommand(req.body);
  const result = await createShipmentCommand(input, getCommandContext(req));
  res.status(201).json({
    success: true,
    message: "Shipment created successfully",
    data: {
      aggregateId: result.aggregateId,
      version: result.version,
      state: result.state,
      eventCount: result.eventCount,
      shipment: result.shipment,
    },
  });
};

export const dispatchShipmentCommandHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const command = parseExistingAggregateCommand(req.body);
  const result = await dispatchShipmentCommand(
    command.shipmentId,
    command.expectedVersion,
    getCommandContext(req)
  );
  respondWithCommand(res, result, "Shipment dispatched successfully");
};

export const deliverShipmentCommandHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const command = parseExistingAggregateCommand(req.body);
  const result = await deliverShipmentCommand(
    command.shipmentId,
    command.expectedVersion,
    getCommandContext(req)
  );
  respondWithCommand(res, result, "Shipment delivered successfully");
};

export const cancelShipmentCommandHandler = async (
  req: Request,
  res: Response
): Promise<void> => {
  const command = parseExistingAggregateCommand(req.body);
  const result = await cancelShipmentCommand(
    command.shipmentId,
    command.expectedVersion,
    getCommandContext(req)
  );
  respondWithCommand(res, result, "Shipment cancelled successfully");
};
