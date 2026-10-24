import { Router } from "express";
import {
  createWarehouse,
  deleteWarehouse,
  getWarehouseById,
  getWarehouses,
  updateWarehouse,
} from "../controllers/warehouse.controller";
import { authorizeRoles } from "../middleware/authorize.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { validateObjectIdParam } from "../middleware/validation.middleware";

const router = Router();
const managers = authorizeRoles("admin", "manager");

router.post("/", requireAuth, managers, createWarehouse);
router.get("/", getWarehouses);
router.get("/:id", validateObjectIdParam("id", "warehouse ID"), getWarehouseById);
router.patch(
  "/:id",
  requireAuth,
  managers,
  validateObjectIdParam("id", "warehouse ID"),
  updateWarehouse
);
router.delete(
  "/:id",
  requireAuth,
  authorizeRoles("admin"),
  validateObjectIdParam("id", "warehouse ID"),
  deleteWarehouse
);

export default router;