import mongoose from "mongoose";
import dotenv from "dotenv";
import EventStore from "../models/EventStore";

dotenv.config();

const connectDatabase = async (): Promise<void> => {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    throw new Error("MONGODB_URI is not defined");
  }

  await mongoose.connect(mongoUri);
  await EventStore.init();

  console.log("MongoDB connected successfully");
};

export default connectDatabase;