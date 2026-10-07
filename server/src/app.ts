import express from "express";
import userRoutes from "./routes/user.routes";
import productRoutes from "./routes/product.routes";
import warehouseRoutes from "./routes/warehouse.routes";
import inventoryRoutes from "./routes/inventory.routes";
import eventRoutes from "./routes/event.routes";
import authRoutes from "./routes/auth.routes";
import shipmentRoutes from "./routes/shipment.routes";
import shipmentCommandRoutes from "./routes/shipment.command.routes";
import shipmentQueryRoutes from "./routes/shipment.query.routes";
import { errorHandler } from "./middleware/error.middleware";
import { AppError } from "./utils/AppError";

const app = express();

app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/warehouses", warehouseRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/commands/shipments", shipmentCommandRoutes);
app.use("/api/queries", shipmentQueryRoutes);
app.use("/api/shipments", shipmentRoutes);

app.get("/health", (_req, res) => {
  res.json({
    success: true,
    status: "ok",
    message: "Audit Trail API is running",
  });
});

app.use((_req, _res, next) => {
  next(new AppError("Route not found", 404, "NOT_FOUND"));
});

app.use(errorHandler);

export default app;