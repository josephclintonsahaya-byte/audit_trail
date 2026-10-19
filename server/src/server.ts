import app from "./app";
import connectDatabase from "./config/database";
import { startShipmentProjectionWorker } from "./services/event-sourcing/shipment-projection.worker";
import mongoose from "mongoose";

const PORT = 5000;

const startServer = async (): Promise<void> => {
  let startupOperation = "database.connect";
  try {
    await connectDatabase();

    startupOperation = "shipment_projection_worker.start";
    const stopProjectionWorker = startShipmentProjectionWorker();

    startupOperation = "http.listen";
    const server = app.listen(PORT, () => {
      console.log(JSON.stringify({
        level: "info",
        event: "server.started",
        operation: "http.listen",
        port: PORT,
      }));
    });

    let shutdownPromise: Promise<void> | null = null;

    const shutdown = (signal: string): Promise<void> => {
      if (shutdownPromise) {
        return shutdownPromise;
      }

      shutdownPromise = (async () => {
        console.log(JSON.stringify({
          level: "info",
          event: "server.shutdown_started",
          signal,
        }));

        try {
          await stopProjectionWorker();
        } catch (error) {
          console.error(JSON.stringify({
            level: "error",
            event: "server.shutdown_failed",
            operation: "shipment_projection_worker.stop",
            errorType: error instanceof Error ? error.name : "UnknownError",
          }));
          process.exitCode = 1;
        }

        try {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            });
          });
        } catch (error) {
          console.error(JSON.stringify({
            level: "error",
            event: "server.shutdown_failed",
            operation: "http.close",
            errorType: error instanceof Error ? error.name : "UnknownError",
          }));
          process.exitCode = 1;
        } finally {
          try {
            await mongoose.disconnect();
          } catch (error) {
            console.error(JSON.stringify({
              level: "error",
              event: "server.shutdown_failed",
              operation: "database.disconnect",
              errorType: error instanceof Error ? error.name : "UnknownError",
            }));
            process.exitCode = 1;
          }
        }
      })();

      return shutdownPromise;
    };

    process.once("SIGINT", () => {
      void shutdown("SIGINT");
    });

    process.once("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "server.startup_failed",
      operation: startupOperation,
      errorType: error instanceof Error ? error.name : "UnknownError",
    }));
    process.exitCode = 1;
  }
};

void startServer();
