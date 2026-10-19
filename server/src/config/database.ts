import mongoose from "mongoose";
import dotenv from "dotenv";
import EventStore from "../models/EventStore";
import ShipmentProjection from "../models/ShipmentProjection";

dotenv.config();

const connectDatabase = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined");
  }

  await mongoose.connect(mongoUri);
  await EventStore.init();
  await ShipmentProjection.init();

  console.log(JSON.stringify({
    level: "info",
    event: "database.connected",
    subsystem: "mongodb",
  }));
};

export default connectDatabase;
