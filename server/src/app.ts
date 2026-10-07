import express from "express";
import userRoutes from "./routes/user.routes";
import productRoutes from "./routes/product.routes";
import warehouseRoutes from "./routes/warehouse.routes";

const app = express();

app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/warehouses", warehouseRoutes);

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "Audit Trail API is running",
  });
});

export default app;