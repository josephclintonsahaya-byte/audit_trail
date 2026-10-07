import { Request, Response } from "express";
import Warehouse from "../models/Warehouse";

export const createWarehouse = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { name, code, location, status } = req.body;

    const warehouse = await Warehouse.create({
      name,
      code,
      location,
      status,
    });

    res.status(201).json({
      message: "Warehouse created successfully",
      warehouse,
    });
  } catch (error: any) {
    console.error("Create warehouse error:", error);

    if (error.code === 11000) {
      res.status(409).json({
        message: "Warehouse code already exists",
      });
      return;
    }

    res.status(500).json({
      message: "Failed to create warehouse",
    });
  }
};

export const getWarehouses = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    const warehouses = await Warehouse.find();

    res.status(200).json({
      warehouses,
    });
  } catch (error) {
    console.error("Get warehouses error:", error);

    res.status(500).json({
      message: "Failed to fetch warehouses",
    });
  }
};

export const getWarehouseById = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const warehouse = await Warehouse.findById(req.params.id);

    if (!warehouse) {
      res.status(404).json({
        message: "Warehouse not found",
      });
      return;
    }

    res.status(200).json({
      warehouse,
    });
  } catch (error) {
    console.error("Get warehouse error:", error);

    res.status(500).json({
      message: "Failed to fetch warehouse",
    });
  }
};

export const updateWarehouse = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const warehouse = await Warehouse.findByIdAndUpdate(
      req.params.id,
      req.body,
      {
        returnDocument: "after",
        runValidators: true,
      }
    );

    if (!warehouse) {
      res.status(404).json({
        message: "Warehouse not found",
      });
      return;
    }

    res.status(200).json({
      message: "Warehouse updated successfully",
      warehouse,
    });
  } catch (error: any) {
    console.error("Update warehouse error:", error);

    if (error.code === 11000) {
      res.status(409).json({
        message: "Warehouse code already exists",
      });
      return;
    }

    res.status(500).json({
      message: "Failed to update warehouse",
    });
  }
};

export const deleteWarehouse = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const warehouse = await Warehouse.findByIdAndDelete(req.params.id);

    if (!warehouse) {
      res.status(404).json({
        message: "Warehouse not found",
      });
      return;
    }

    res.status(200).json({
      message: "Warehouse deleted successfully",
      warehouse,
    });
  } catch (error) {
    console.error("Delete warehouse error:", error);

    res.status(500).json({
      message: "Failed to delete warehouse",
    });
  }
};