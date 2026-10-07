import mongoose, { ClientSession, Types } from "mongoose";
import Inventory from "../models/Inventory";
import Product from "../models/Product";
import Shipment, {
  ShipmentStatus,
  createShipmentNumber,
} from "../models/Shipment";
import Warehouse from "../models/Warehouse";
import { createBusinessEvent } from "./event.service";
import { AppError } from "../utils/AppError";
import { assertObjectId } from "../utils/validation";
import { EventMetadata, ShipmentDomainEventType } from "../models/EventStore";
import {
  appendEvent,
  assertExpectedVersion,
  getCurrentAggregateVersion,
  loadShipmentEvents,
} from "./event-sourcing/event-store.service";
import {
  ShipmentAggregateState,
  replayShipmentEvents,
} from "./event-sourcing/shipment.reducer";

export interface ShipmentItemInput {
  productId: string;
  quantity: number;
}

export interface CreateShipmentInput {
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  items: ShipmentItemInput[];
}

export class ShipmentServiceError extends AppError {
  constructor(
    message: string,
    public readonly statusCode: 400 | 404 | 409
  ) {
    super(
      message,
      statusCode,
      statusCode === 404
        ? "SHIPMENT_RESOURCE_NOT_FOUND"
        : statusCode === 409
          ? "SHIPMENT_CONFLICT"
          : "SHIPMENT_VALIDATION_ERROR"
    );
    this.name = "ShipmentServiceError";
  }
}

const requireObjectId = (value: unknown, field: string): string => {
  return assertObjectId(value, field);
};

const validateShipmentInput = async (
  input: CreateShipmentInput,
  session?: ClientSession
): Promise<void> => {
  const sourceId = requireObjectId(input.sourceWarehouseId, "sourceWarehouseId");
  const destinationId = requireObjectId(
    input.destinationWarehouseId,
    "destinationWarehouseId"
  );

  if (sourceId === destinationId) {
    throw new ShipmentServiceError(
      "Source and destination warehouses must be different",
      400
    );
  }

  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new ShipmentServiceError(
      "A shipment must contain at least one item",
      400
    );
  }

  const source = await Warehouse.findById(sourceId).session(session ?? null);
  if (!source) {
    throw new ShipmentServiceError("Source warehouse not found", 404);
  }

  const destination = await Warehouse.findById(destinationId).session(
    session ?? null
  );
  if (!destination) {
    throw new ShipmentServiceError("Destination warehouse not found", 404);
  }

  const seenProducts = new Set<string>();

  for (const item of input.items) {
    const productId = requireObjectId(item?.productId, "productId");

    if (
      typeof item.quantity !== "number" ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0
    ) {
      throw new ShipmentServiceError(
        "Each item quantity must be a positive whole number",
        400
      );
    }

    if (seenProducts.has(productId)) {
      throw new ShipmentServiceError(
        "A product may only appear once in a shipment",
        400
      );
    }
    seenProducts.add(productId);

    const product = await Product.findById(productId).session(session ?? null);
    if (!product) {
      throw new ShipmentServiceError("A shipment product was not found", 404);
    }
  }
};

const shipmentPopulation = [
  { path: "sourceWarehouseId" },
  { path: "destinationWarehouseId" },
  { path: "items.productId" },
  { path: "createdBy", select: "name email role" },
];

const populateShipment = (query: ReturnType<typeof Shipment.findById>) =>
  query.populate(shipmentPopulation);

const eventPayloadFromShipment = (
  shipment: InstanceType<typeof Shipment>
): Record<string, unknown> => ({
  shipmentNumber: shipment.shipmentNumber,
  sourceWarehouseId: shipment.sourceWarehouseId.toString(),
  destinationWarehouseId: shipment.destinationWarehouseId.toString(),
  items: shipment.items.map((item) => ({
    productId: item.productId.toString(),
    quantity: item.quantity,
  })),
  status: shipment.status,
  createdBy: shipment.createdBy.toString(),
});

const ensureEventStream = async (
  shipment: InstanceType<typeof Shipment>,
  performedBy: string,
  session: ClientSession
): Promise<number> => {
  const version = await getCurrentAggregateVersion(shipment._id, session);
  if (version > 0) return version;

  const imported = await appendEvent({
    aggregateId: shipment._id,
    aggregateType: "Shipment",
    eventType: "SHIPMENT_IMPORTED",
    payload: eventPayloadFromShipment(shipment),
    performedBy,
    expectedVersion: 0,
    metadata: { source: "legacy-snapshot-migration", command: "IMPORT_EXISTING_SHIPMENT" },
    session,
  });
  shipment.version = imported.version;
  await shipment.save({ session });
  return imported.version;
};

const requireExpectedVersion = async (
  shipment: InstanceType<typeof Shipment>,
  performedBy: string,
  expectedVersion: number | undefined,
  session: ClientSession
): Promise<{ version: number; state: ShipmentAggregateState }> => {
  const currentVersion = await ensureEventStream(shipment, performedBy, session);
  const requiredVersion = expectedVersion ?? currentVersion;
  await assertExpectedVersion(shipment._id, requiredVersion, session);
  const events = await loadShipmentEvents(shipment._id, { session });
  const state = replayShipmentEvents(events);
  if (!state) {
    throw new AppError("Shipment event stream is empty", 500, "EVENT_STREAM_CORRUPTED");
  }
  const projectionMatches =
    shipment.version === currentVersion &&
    shipment.shipmentNumber === state.shipmentNumber &&
    shipment.status === state.status &&
    shipment.sourceWarehouseId.toString() === state.sourceWarehouseId &&
    shipment.destinationWarehouseId.toString() === state.destinationWarehouseId &&
    shipment.createdBy.toString() === state.createdBy &&
    shipment.items.length === state.items.length &&
    shipment.items.every(
      (item, index) =>
        item.productId.toString() === state.items[index]?.productId &&
        item.quantity === state.items[index]?.quantity
    );
  if (!projectionMatches) {
    throw new AppError(
      "Shipment state does not match its event stream",
      500,
      "SHIPMENT_PROJECTION_MISMATCH"
    );
  }
  return { version: currentVersion, state };
};

const appendShipmentEvent = async (
  shipment: InstanceType<typeof Shipment>,
  eventType: ShipmentDomainEventType,
  payload: Record<string, unknown>,
  performedBy: string,
  expectedVersion: number,
  session: ClientSession,
  metadata: EventMetadata = { source: "legacy-shipment-api" }
): Promise<void> => {
  const event = await appendEvent({
    aggregateId: shipment._id,
    aggregateType: "Shipment",
    eventType,
    payload,
    performedBy,
    expectedVersion,
    metadata,
    session,
  });
  shipment.version = event.version;
};

export const createShipment = async (
  input: CreateShipmentInput,
  actorId: string,
  metadata: EventMetadata = { source: "legacy-shipment-api", command: "CREATE_SHIPMENT" },
  aggregateId?: Types.ObjectId
) => {
  requireObjectId(actorId, "authenticated user");

  const shipment = await mongoose.connection.transaction(async (session) => {
    await validateShipmentInput(input, session);

    const created = await Shipment.create(
      [
        {
          ...(aggregateId ? { _id: aggregateId } : {}),
          shipmentNumber: createShipmentNumber(),
          sourceWarehouseId: input.sourceWarehouseId,
          destinationWarehouseId: input.destinationWarehouseId,
          items: input.items,
          status: "CREATED",
          createdBy: actorId,
        },
      ],
      { session }
    );
    const document = created[0];

    await appendShipmentEvent(
      document,
      "SHIPMENT_CREATED",
      eventPayloadFromShipment(document),
      actorId,
      0,
      session,
      metadata
    );
    await document.save({ session });

    await createBusinessEvent({
      eventType: "SHIPMENT_CREATED",
      entityType: "Shipment",
      entityId: document._id,
      performedBy: actorId,
      payload: {
        shipmentNumber: document.shipmentNumber,
        sourceWarehouseId: document.sourceWarehouseId,
        destinationWarehouseId: document.destinationWarehouseId,
        items: document.items,
      },
      session,
    });

    return document;
  });

  return populateShipment(Shipment.findById(shipment._id));
};

export const listShipments = () =>
  Shipment.find().sort({ createdAt: -1 }).populate(shipmentPopulation);

export const getShipment = async (shipmentId: string) => {
  requireObjectId(shipmentId, "shipmentId");
  const shipment = await populateShipment(Shipment.findById(shipmentId));

  if (!shipment) {
    throw new ShipmentServiceError("Shipment not found", 404);
  }

  return shipment;
};

export const updateDraftShipment = async (
  shipmentId: string,
  changes: Partial<CreateShipmentInput>,
  actorId: string,
  expectedVersion?: number,
  metadata: EventMetadata = { source: "legacy-shipment-api", command: "UPDATE_SHIPMENT" }
) => {
  requireObjectId(shipmentId, "shipmentId");
  requireObjectId(actorId, "authenticated user");

  const updated = await mongoose.connection.transaction(async (session) => {
    const shipment = await Shipment.findById(shipmentId).session(session);

    if (!shipment) {
      throw new ShipmentServiceError("Shipment not found", 404);
    }

    const current = await requireExpectedVersion(
      shipment,
      actorId,
      expectedVersion,
      session
    );

    if (shipment.status !== "CREATED") {
      throw new ShipmentServiceError(
        "Only CREATED shipments can be edited",
        409
      );
    }

    const next: CreateShipmentInput = {
      sourceWarehouseId:
        changes.sourceWarehouseId ?? current.state.sourceWarehouseId,
      destinationWarehouseId:
        changes.destinationWarehouseId ??
        current.state.destinationWarehouseId,
      items:
        changes.items ??
        current.state.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
    };
    await validateShipmentInput(next, session);

    shipment.sourceWarehouseId = new Types.ObjectId(next.sourceWarehouseId);
    shipment.destinationWarehouseId = new Types.ObjectId(
      next.destinationWarehouseId
    );
    shipment.set(
      "items",
      next.items.map((item) => ({
        productId: new Types.ObjectId(item.productId),
        quantity: item.quantity,
      }))
    );
    await appendShipmentEvent(
      shipment,
      "SHIPMENT_UPDATED",
      eventPayloadFromShipment(shipment),
      actorId,
      current.version,
      session,
      metadata
    );
    await shipment.save({ session });

    await createBusinessEvent({
      eventType: "SHIPMENT_UPDATED",
      entityType: "Shipment",
      entityId: shipment._id,
      performedBy: actorId,
      payload: {
        sourceWarehouseId: shipment.sourceWarehouseId,
        destinationWarehouseId: shipment.destinationWarehouseId,
        items: shipment.items,
      },
      session,
    });

    return shipment;
  });

  return populateShipment(Shipment.findById(updated._id));
};

const requireTransition = (
  current: ShipmentStatus,
  target: ShipmentStatus
): void => {
  const allowed: Record<ShipmentStatus, ShipmentStatus[]> = {
    CREATED: ["IN_TRANSIT", "CANCELLED"],
    IN_TRANSIT: ["DELIVERED", "CANCELLED"],
    DELIVERED: [],
    CANCELLED: [],
  };

  if (!allowed[current].includes(target)) {
    throw new ShipmentServiceError(
      `Cannot change shipment status from ${current} to ${target}`,
      409
    );
  }
};

const updateShipmentStatus = async (
  shipmentId: string,
  actorId: string,
  targetStatus: "IN_TRANSIT" | "CANCELLED",
  expectedVersion?: number,
  metadata: EventMetadata = { source: "legacy-shipment-api" }
) => {
  requireObjectId(shipmentId, "shipmentId");
  requireObjectId(actorId, "authenticated user");

  const updated = await mongoose.connection.transaction(async (session) => {
    const shipment = await Shipment.findById(shipmentId).session(session);

    if (!shipment) {
      throw new ShipmentServiceError("Shipment not found", 404);
    }

    const current = await requireExpectedVersion(
      shipment,
      actorId,
      expectedVersion,
      session
    );
    requireTransition(current.state.status, targetStatus);
    shipment.status = targetStatus;

    const eventType =
      targetStatus === "IN_TRANSIT"
        ? "SHIPMENT_DISPATCHED"
        : "SHIPMENT_CANCELLED";
    await appendShipmentEvent(
      shipment,
      eventType,
      eventPayloadFromShipment(shipment),
      actorId,
      current.version,
      session,
      metadata
    );
    await shipment.save({ session });

    await createBusinessEvent({
      eventType,
      entityType: "Shipment",
      entityId: shipment._id,
      performedBy: actorId,
      payload: {
        shipmentNumber: shipment.shipmentNumber,
        status: shipment.status,
        sourceWarehouseId: shipment.sourceWarehouseId,
        destinationWarehouseId: shipment.destinationWarehouseId,
        items: shipment.items,
      },
      session,
    });

    return shipment;
  });

  return populateShipment(Shipment.findById(updated._id));
};

export const dispatchShipment = (
  shipmentId: string,
  actorId: string,
  expectedVersion?: number,
  metadata?: EventMetadata
) =>
  updateShipmentStatus(
    shipmentId,
    actorId,
    "IN_TRANSIT",
    expectedVersion,
    metadata
  );

export const cancelShipment = (
  shipmentId: string,
  actorId: string,
  expectedVersion?: number,
  metadata?: EventMetadata
) =>
  updateShipmentStatus(
    shipmentId,
    actorId,
    "CANCELLED",
    expectedVersion,
    metadata
  );

export const deliverShipment = async (
  shipmentId: string,
  actorId: string,
  expectedVersion?: number,
  metadata: EventMetadata = { source: "legacy-shipment-api", command: "DELIVER_SHIPMENT" }
) => {
  requireObjectId(shipmentId, "shipmentId");
  requireObjectId(actorId, "authenticated user");

  const delivered = await mongoose.connection.transaction(async (session) => {
    const shipment = await Shipment.findById(shipmentId).session(session);

    if (!shipment) {
      throw new ShipmentServiceError("Shipment not found", 404);
    }

    const current = await requireExpectedVersion(
      shipment,
      actorId,
      expectedVersion,
      session
    );
    requireTransition(current.state.status, "DELIVERED");
    const sourceWarehouseId = new Types.ObjectId(current.state.sourceWarehouseId);
    const destinationWarehouseId = new Types.ObjectId(
      current.state.destinationWarehouseId
    );

    for (const item of current.state.items) {
      const productId = new Types.ObjectId(item.productId);
      const sourceInventory = await Inventory.findOne({
        productId,
        warehouseId: sourceWarehouseId,
      }).session(session);

      if (!sourceInventory) {
        throw new ShipmentServiceError(
          `Source inventory is missing for product ${item.productId}`,
          409
        );
      }

      const previousSourceQuantity = sourceInventory.quantity;
      if (previousSourceQuantity < item.quantity) {
        throw new ShipmentServiceError(
          `Insufficient source stock for product ${item.productId}`,
          409
        );
      }

      const updatedSource = await Inventory.findOneAndUpdate(
        {
          _id: sourceInventory._id,
          quantity: { $gte: item.quantity },
        },
        { $inc: { quantity: -item.quantity } },
        { returnDocument: "after", runValidators: true, session }
      );

      if (!updatedSource) {
        throw new ShipmentServiceError(
          `Insufficient source stock for product ${item.productId}`,
          409
        );
      }

      const existingDestination = await Inventory.findOne({
        productId,
        warehouseId: destinationWarehouseId,
      }).session(session);
      const previousDestinationQuantity =
        existingDestination?.quantity ?? 0;
      let updatedDestination;

      if (existingDestination) {
        updatedDestination = await Inventory.findByIdAndUpdate(
          existingDestination._id,
          { $inc: { quantity: item.quantity } },
          { returnDocument: "after", runValidators: true, session }
        );
      } else {
        const createdDestination = await Inventory.create(
          [
            {
              productId,
              warehouseId: destinationWarehouseId,
              quantity: item.quantity,
            },
          ],
          { session }
        );
        updatedDestination = createdDestination[0];
      }

      if (!updatedDestination) {
        throw new Error("Destination inventory could not be updated");
      }

      const stockPayload = {
        shipmentId: shipment._id,
        shipmentNumber: shipment.shipmentNumber,
        productId,
        sourceWarehouseId,
        destinationWarehouseId,
        quantity: item.quantity,
      };

      await createBusinessEvent({
        eventType: "STOCK_DECREASED",
        entityType: "Inventory",
        entityId: updatedSource._id,
        performedBy: actorId,
        payload: {
          ...stockPayload,
          warehouseId: sourceWarehouseId,
          previousQuantity: previousSourceQuantity,
          newQuantity: updatedSource.quantity,
        },
        session,
      });
      await createBusinessEvent({
        eventType: "STOCK_INCREASED",
        entityType: "Inventory",
        entityId: updatedDestination._id,
        performedBy: actorId,
        payload: {
          ...stockPayload,
          warehouseId: destinationWarehouseId,
          previousQuantity: previousDestinationQuantity,
          newQuantity: updatedDestination.quantity,
        },
        session,
      });
    }

    shipment.status = "DELIVERED";
    await appendShipmentEvent(
      shipment,
      "SHIPMENT_DELIVERED",
      eventPayloadFromShipment(shipment),
      actorId,
      current.version,
      session,
      metadata
    );
    await shipment.save({ session });

    await createBusinessEvent({
      eventType: "SHIPMENT_DELIVERED",
      entityType: "Shipment",
      entityId: shipment._id,
      performedBy: actorId,
      payload: {
        shipmentNumber: shipment.shipmentNumber,
        sourceWarehouseId,
        destinationWarehouseId,
        items: shipment.items,
      },
      session,
    });

    return shipment;
  });

  return populateShipment(Shipment.findById(delivered._id));
};

export const deleteDraftShipment = async (
  shipmentId: string,
  actorId: string,
  expectedVersion?: number,
  metadata: EventMetadata = { source: "legacy-shipment-api", command: "DELETE_SHIPMENT" }
): Promise<void> => {
  requireObjectId(shipmentId, "shipmentId");
  requireObjectId(actorId, "authenticated user");

  await mongoose.connection.transaction(async (session) => {
    const shipment = await Shipment.findById(shipmentId).session(session);

    if (!shipment) {
      throw new ShipmentServiceError("Shipment not found", 404);
    }

    const current = await requireExpectedVersion(
      shipment,
      actorId,
      expectedVersion,
      session
    );
    if (current.state.status !== "CREATED") {
      throw new ShipmentServiceError(
        "Only CREATED shipments can be deleted",
        409
      );
    }

    await appendShipmentEvent(
      shipment,
      "SHIPMENT_DELETED",
      eventPayloadFromShipment(shipment),
      actorId,
      current.version,
      session,
      metadata
    );
    await createBusinessEvent({
      eventType: "SHIPMENT_DELETED",
      entityType: "Shipment",
      entityId: shipment._id,
      performedBy: actorId,
      payload: {
        shipmentNumber: shipment.shipmentNumber,
        sourceWarehouseId: shipment.sourceWarehouseId,
        destinationWarehouseId: shipment.destinationWarehouseId,
        items: shipment.items,
      },
      session,
    });
    await shipment.deleteOne({ session });
  });
};
