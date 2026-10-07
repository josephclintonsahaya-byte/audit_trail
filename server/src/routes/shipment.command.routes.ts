import { Router } from "express";
import {
  cancelShipmentCommandHandler,
  createShipmentCommandHandler,
  deliverShipmentCommandHandler,
  dispatchShipmentCommandHandler,
} from "../controllers/shipment.command.controller";
import { authorizeRoles } from "../middleware/authorize.middleware";
import { requireAuth } from "../middleware/auth.middleware";

const router = Router();

router.use(requireAuth, authorizeRoles("admin", "manager"));
router.post("/create", createShipmentCommandHandler);
router.post("/dispatch", dispatchShipmentCommandHandler);
router.post("/deliver", deliverShipmentCommandHandler);
router.post("/cancel", cancelShipmentCommandHandler);

export default router;
