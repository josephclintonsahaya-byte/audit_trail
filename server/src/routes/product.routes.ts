import { Router } from "express";
import {
  createProduct,
  getProducts,
  getProductById,
  updateProduct,
  deleteProduct,
} from "../controllers/product.controller";
import { validateObjectIdParam } from "../middleware/validation.middleware";

const router = Router();

router.post("/", createProduct);
router.get("/", getProducts);
router.get("/:id", validateObjectIdParam("id", "product ID"), getProductById);
router.patch("/:id", validateObjectIdParam("id", "product ID"), updateProduct);
router.delete("/:id", validateObjectIdParam("id", "product ID"), deleteProduct);

export default router;