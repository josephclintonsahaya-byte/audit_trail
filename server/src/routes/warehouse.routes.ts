import { Router } from "express";
import {
  createWarehouse,
  getWarehouses,
  getWarehouseById,
  updateWarehouse,
  deleteWarehouse,
} from "../controllers/warehouse.controller";

const router = Router();

router.post("/", createWarehouse);
router.get("/", getWarehouses);
router.get("/:id", getWarehouseById);
router.patch("/:id", updateWarehouse);
router.delete("/:id", deleteWarehouse);

export default router;