import { isArray, isLike } from "./shared-funcs";
import Error400 from "../errors/error-400";
import Error404 from "../errors/error-404";
import { IStockGroup } from "../types/entity-types";
import StockGroupRepository from "../shared/services/repos/stock-group-repository";
import { Request, NextFunction, Response } from "express";

function validateStockGroup(payload: unknown): payload is IStockGroup {
  return (
    isLike<IStockGroup>(payload) &&
    typeof payload.name === "string" &&
    typeof payload.symbols === "object"
  );
}

export async function validateGroupId(id: string) {
  const idInt = parseInt(id);
  if (!idInt || idInt <= 0) {
    throw new Error400("id must be a number greater than 0");
  }
  const rows = await StockGroupRepository.getGroup(idInt);
  if (!rows[0]) {
    throw new Error404("group not found");
  }
}

export async function checkIfGroupExists(id: number) {
  const rows = await StockGroupRepository.getGroupById(id);
  return rows.length > 0;
}

export async function validateGroup(
  request: Request,
  res: Response,
  next: NextFunction,
) {
  const method = request?.method;
  if (method === "GET" || method === "DELETE") {
    next();
    return;
  }

  try {
    if (validateStockGroup(request.body)) {
      const group = request.body;
      const name = group.name;
      const names = group.symbols;
      const id = group.id;
      if (!name.match(/^[a-zA-Z0-9 ]+$/)) {
        throw new Error400("name must consist of alphanumeric characters");
      }
      if (!isArray(names)) {
        throw new Error400("group names must be an array");
      }
      if (!names.every((name) => typeof name === "string")) {
        throw new Error400("every item in the array must be a string");
      }
      if (method !== "POST") {
        if (!id) {
          throw new Error404("group id not specified");
        }
        const exists = await checkIfGroupExists(id);
        if (!exists) {
          throw new Error404("group does not exist");
        }
      }
      next();
    } else {
      throw new Error400("invalid payload");
    }
  } catch (error) {
    return next(error);
  }
}
