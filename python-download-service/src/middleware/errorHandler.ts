import { ErrorRequestHandler } from "express";

import { logger } from "../logger";

export interface AppError extends Error {
  statusCode?: number;
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  const statusCode = (err as AppError).statusCode ?? 500;
  const message = err instanceof Error ? err.message : "Internal server error";

  if (process.env.NODE_ENV !== "production") {
    logger.error(err);
  } else {
    logger.error(`[${statusCode}] ${message}`);
  }

  res.status(statusCode).json({ error: message });
};
