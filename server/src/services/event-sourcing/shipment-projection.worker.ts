import { projectPendingShipmentEvents } from "./shipment-projection.service";

const POLL_INTERVAL_MS = 1000;
const BATCH_SIZE = 100;

let workerLoop: Promise<void> | null = null;
let shouldStop = false;
let workerFailureLogged = false;

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const runWorker = async (): Promise<void> => {
  while (!shouldStop) {
    try {
      const processed = await projectPendingShipmentEvents(BATCH_SIZE);
      workerFailureLogged = false;
      if (processed === 0) await delay(POLL_INTERVAL_MS);
    } catch (error) {
      if (!workerFailureLogged) {
        console.error(JSON.stringify({
          level: "error",
          event: "shipment_projection.processing_failed",
          operation: "project_pending_events",
          errorType: error instanceof Error ? error.name : "UnknownError",
          retrying: true,
        }));
        workerFailureLogged = true;
      }
      await delay(POLL_INTERVAL_MS);
    }
  }
};

export const startShipmentProjectionWorker = (): (() => Promise<void>) => {
  if (!workerLoop) {
    shouldStop = false;
    workerFailureLogged = false;
    workerLoop = runWorker();
  }

  return async () => {
    shouldStop = true;
    if (workerLoop) await workerLoop;
    workerLoop = null;
  };
};
