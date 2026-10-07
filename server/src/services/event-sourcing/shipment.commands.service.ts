import { Types } from "mongoose";
import {
  CreateShipmentInput,
  cancelShipment,
  createShipment,
  deliverShipment,
  dispatchShipment,
} from "../shipment.service";
import { EventMetadata } from "../../models/EventStore";
import { reconstructShipment } from "./event-store.service";

export interface ShipmentCommandContext {
  performedBy: string;
  correlationId?: string;
}

const commandMetadata = (
  command: string,
  context: ShipmentCommandContext
): EventMetadata => ({
  command,
  source: "cqrs-command-api",
  ...(context.correlationId ? { correlationId: context.correlationId } : {}),
});

const commandResult = async (aggregateId: string, shipment: unknown) => ({
  ...(await reconstructShipment(aggregateId)),
  shipment,
});

export const createShipmentCommand = (
  input: CreateShipmentInput,
  context: ShipmentCommandContext
): Promise<Awaited<ReturnType<typeof commandResult>>> => {
  const aggregateId = new Types.ObjectId();
  return createShipment(
    input,
    context.performedBy,
    commandMetadata("CREATE_SHIPMENT", context),
    aggregateId
  ).then((shipment) => commandResult(aggregateId.toString(), shipment));
};

export const dispatchShipmentCommand = async (
  shipmentId: string,
  expectedVersion: number,
  context: ShipmentCommandContext
) => {
  const shipment = await dispatchShipment(
    shipmentId,
    context.performedBy,
    expectedVersion,
    commandMetadata("DISPATCH_SHIPMENT", context)
  );
  return commandResult(shipmentId, shipment);
};

export const deliverShipmentCommand = async (
  shipmentId: string,
  expectedVersion: number,
  context: ShipmentCommandContext
) => {
  const shipment = await deliverShipment(
    shipmentId,
    context.performedBy,
    expectedVersion,
    commandMetadata("DELIVER_SHIPMENT", context)
  );
  return commandResult(shipmentId, shipment);
};

export const cancelShipmentCommand = async (
  shipmentId: string,
  expectedVersion: number,
  context: ShipmentCommandContext
) => {
  const shipment = await cancelShipment(
    shipmentId,
    context.performedBy,
    expectedVersion,
    commandMetadata("CANCEL_SHIPMENT", context)
  );
  return commandResult(shipmentId, shipment);
};
