import { Router } from "express";
import {
  cancelShipmentHandler,
  createShipmentHandler,
  deliverShipmentHandler,
  dispatchShipmentHandler,
  deleteShipment,
  getShipmentById,
  getShipments,
  updateShipment,
} from "../controllers/shipment.controller";
import { authorizeRoles } from "../middleware/authorize.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { validateObjectIdParam } from "../middleware/validation.middleware";
import {
  getShipmentEventStreamQuery,
  reconstructShipmentQuery,
} from "../controllers/shipment.query.controller";

const router = Router();
const managers = authorizeRoles("admin", "manager");

router.use(requireAuth);
router.post("/", managers, createShipmentHandler);
router.get("/", getShipments);
router.get(
  "/:id/events",
  validateObjectIdParam("id", "shipment ID"),
  getShipmentEventStreamQuery
);
router.get(
  "/:id/reconstruct",
  validateObjectIdParam("id", "shipment ID"),
  reconstructShipmentQuery
);
router.get("/:id", validateObjectIdParam("id", "shipment ID"), getShipmentById);
router.patch("/:id", validateObjectIdParam("id", "shipment ID"), managers, updateShipment);
router.delete("/:id", validateObjectIdParam("id", "shipment ID"), authorizeRoles("admin"), deleteShipment);
router.post("/:id/dispatch", validateObjectIdParam("id", "shipment ID"), managers, dispatchShipmentHandler);
router.post("/:id/deliver", validateObjectIdParam("id", "shipment ID"), managers, deliverShipmentHandler);
router.post("/:id/cancel", validateObjectIdParam("id", "shipment ID"), managers, cancelShipmentHandler);

export default router;
