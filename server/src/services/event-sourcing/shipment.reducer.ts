import {
  ShipmentDomainEvent,
  ShipmentDomainEventType,
} from "../../models/EventStore";

export interface ShipmentAggregateState {
  shipmentNumber: string;
  sourceWarehouseId: string;
  destinationWarehouseId: string;
  items: Array<{ productId: string; quantity: number }>;
  status: "CREATED" | "IN_TRANSIT" | "DELIVERED" | "CANCELLED";
  createdBy: string;
  deleted?: boolean;
}

type EventHandler = (
  state: ShipmentAggregateState | null,
  event: ShipmentDomainEvent
) => ShipmentAggregateState;

const getPayload = (event: ShipmentDomainEvent): Record<string, unknown> =>
  event.payload;

const requireState = (
  state: ShipmentAggregateState | null,
  event: ShipmentDomainEvent
): ShipmentAggregateState => {
  if (!state) {
    throw new Error(`Shipment event ${event.eventType} requires a creation event`);
  }
  return state;
};

const creationHandler: EventHandler = (_state, event) => {
  const payload = getPayload(event);
  const items = payload.items;
  if (
    typeof payload.shipmentNumber !== "string" ||
    typeof payload.sourceWarehouseId !== "string" ||
    typeof payload.destinationWarehouseId !== "string" ||
    typeof payload.createdBy !== "string" ||
    !Array.isArray(items)
  ) {
    throw new Error("Shipment creation event payload is invalid");
  }

  return {
    shipmentNumber: payload.shipmentNumber,
    sourceWarehouseId: payload.sourceWarehouseId,
    destinationWarehouseId: payload.destinationWarehouseId,
    items: items.map((item) => {
      if (
        typeof item !== "object" ||
        item === null ||
        !("productId" in item) ||
        typeof item.productId !== "string" ||
        !("quantity" in item) ||
        typeof item.quantity !== "number"
      ) {
        throw new Error("Shipment creation event item is invalid");
      }
      return { productId: item.productId, quantity: item.quantity };
    }),
    status:
      payload.status === "IN_TRANSIT" ||
      payload.status === "DELIVERED" ||
      payload.status === "CANCELLED"
        ? payload.status
        : "CREATED",
    createdBy: payload.createdBy,
    ...(payload.deleted === true ? { deleted: true } : {}),
  };
};

const handlers: Record<ShipmentDomainEventType, EventHandler> = {
  SHIPMENT_CREATED: creationHandler,
  SHIPMENT_IMPORTED: creationHandler,
  SHIPMENT_UPDATED: (state, event) => {
    const previous = requireState(state, event);
    const payload = getPayload(event);
    const next: ShipmentAggregateState = { ...previous };
    if (typeof payload.sourceWarehouseId === "string") {
      next.sourceWarehouseId = payload.sourceWarehouseId;
    }
    if (typeof payload.destinationWarehouseId === "string") {
      next.destinationWarehouseId = payload.destinationWarehouseId;
    }
    if (Array.isArray(payload.items)) {
      next.items = payload.items.map((item) => {
        if (
          typeof item !== "object" ||
          item === null ||
          !("productId" in item) ||
          typeof item.productId !== "string" ||
          !("quantity" in item) ||
          typeof item.quantity !== "number"
        ) {
          throw new Error("Shipment update event item is invalid");
        }
        return { productId: item.productId, quantity: item.quantity };
      });
    }
    return next;
  },
  SHIPMENT_DISPATCHED: (state, event) => ({
    ...requireState(state, event),
    status: "IN_TRANSIT",
  }),
  SHIPMENT_DELIVERED: (state, event) => ({
    ...requireState(state, event),
    status: "DELIVERED",
  }),
  SHIPMENT_CANCELLED: (state, event) => ({
    ...requireState(state, event),
    status: "CANCELLED",
  }),
  SHIPMENT_DELETED: (state, event) => ({
    ...requireState(state, event),
    deleted: true,
  }),
};

export const applyShipmentEvent = (
  state: ShipmentAggregateState | null,
  event: ShipmentDomainEvent
): ShipmentAggregateState => {
  const handler = handlers[event.eventType];
  if (!handler) {
    throw new Error(`Unsupported shipment event: ${event.eventType}`);
  }
  return handler(state, event);
};

export const replayShipmentEvents = (
  events: ShipmentDomainEvent[]
): ShipmentAggregateState | null =>
  events.reduce<ShipmentAggregateState | null>(applyShipmentEvent, null);
