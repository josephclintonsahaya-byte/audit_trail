import { Router } from "express";
import {
  getShipmentEventStreamQuery,
  getShipmentStateQuery,
  reconstructShipmentQuery,
} from "../controllers/shipment.query.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validateObjectIdParam } from "../middleware/validation.middleware";

const router = Router();

router.use(requireAuth);
router.get(
  "/shipments/:id",
  validateObjectIdParam("id", "shipment ID"),
  getShipmentStateQuery
);
router.get(
  "/shipments/:id/events",
  validateObjectIdParam("id", "shipment ID"),
  getShipmentEventStreamQuery
);
router.get(
  "/shipments/:id/reconstruct",
  validateObjectIdParam("id", "shipment ID"),
  reconstructShipmentQuery
);

export default router;
