import { Router } from "express";
import {
  createWarehouse,
  getWarehouses,
  getWarehouseById,
  updateWarehouse,
  deleteWarehouse,
} from "../controllers/warehouse.controller";
import { validateObjectIdParam } from "../middleware/validation.middleware";

const router = Router();

router.post("/", createWarehouse);
router.get("/", getWarehouses);
router.get("/:id", validateObjectIdParam("id", "warehouse ID"), getWarehouseById);
router.patch("/:id", validateObjectIdParam("id", "warehouse ID"), updateWarehouse);
router.delete("/:id", validateObjectIdParam("id", "warehouse ID"), deleteWarehouse);

export default router;