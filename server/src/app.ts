import express from "express";
import userRoutes from "./routes/user.routes";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "Audit Trail API is running",
  });
});

app.use("/api/users", userRoutes);

export default app;