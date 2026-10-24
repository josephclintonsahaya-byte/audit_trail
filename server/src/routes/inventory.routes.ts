import { Router } from "express";
import {
  createInventory,
  getInventories,
  getInventoryById,
  updateInventory,
  deleteInventory,
} from "../controllers/inventory.controller";
import { authorizeRoles } from "../middleware/authorize.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { validateObjectIdParam } from "../middleware/validation.middleware";

const router = Router();
const inventoryManagers = authorizeRoles("admin", "manager");

router.post("/", requireAuth, inventoryManagers, createInventory);
router.get("/", requireAuth, getInventories);
router.get("/:id", requireAuth, validateObjectIdParam("id", "inventory ID"), getInventoryById);
router.patch(
  "/:id",
  requireAuth,
  inventoryManagers,
  validateObjectIdParam("id", "inventory ID"),
  updateInventory
);
router.delete(
  "/:id",
  requireAuth,
  inventoryManagers,
  validateObjectIdParam("id", "inventory ID"),
  deleteInventory
);

export default router;