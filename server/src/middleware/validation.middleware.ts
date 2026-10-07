import { NextFunction, Request, Response } from "express";
import { assertObjectId } from "../utils/validation";

export const validateObjectIdParam =
  (param: string, label: string) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    try {
      assertObjectId(req.params[param], label);
      next();
    } catch (error) {
      next(error);
    }
  };
