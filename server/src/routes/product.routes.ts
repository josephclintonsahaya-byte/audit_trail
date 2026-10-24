import { Router } from "express";
import {
  createProduct,
  deleteProduct,
  getProductById,
  getProducts,
  updateProduct,
} from "../controllers/product.controller";
import { authorizeRoles } from "../middleware/authorize.middleware";
import { requireAuth } from "../middleware/auth.middleware";
import { validateObjectIdParam } from "../middleware/validation.middleware";

const router = Router();
const managers = authorizeRoles("admin", "manager");

router.post("/", requireAuth, managers, createProduct);
router.get("/", getProducts);
router.get("/:id", validateObjectIdParam("id", "product ID"), getProductById);
router.patch(
  "/:id",
  requireAuth,
  managers,
  validateObjectIdParam("id", "product ID"),
  updateProduct
);
router.delete(
  "/:id",
  requireAuth,
  authorizeRoles("admin"),
  validateObjectIdParam("id", "product ID"),
  deleteProduct
);

export default router;