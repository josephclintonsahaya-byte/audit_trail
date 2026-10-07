import { Router } from "express";
import {
  createInventory,
  getInventories,
  getInventoryById,
  updateInventory,
  deleteInventory,
} from "../controllers/inventory.controller";
import { requireAuth } from "../middleware/auth.middleware";
import { validateObjectIdParam } from "../middleware/validation.middleware";

const router = Router();

router.post("/", requireAuth, createInventory);
router.get("/", getInventories);
router.get("/:id", validateObjectIdParam("id", "inventory ID"), getInventoryById);
router.patch("/:id", requireAuth, validateObjectIdParam("id", "inventory ID"), updateInventory);
router.delete("/:id", requireAuth, validateObjectIdParam("id", "inventory ID"), deleteInventory);

export default router;