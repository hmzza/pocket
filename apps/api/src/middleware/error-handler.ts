import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

type HttpError = Error & {
  statusCode?: number;
  code?: string;
  details?: unknown;
  entity?: string;
  action?: string;
};

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => {
      const path = issue.path.length ? issue.path.join(".") : "request";
      return `${path}: ${issue.message}`;
    });

    return res.status(400).json({
      message: "Validation failed.",
      details,
      issues: error.issues
    });
  }

  if (error instanceof Error && "statusCode" in error && typeof error.statusCode === "number") {
    const typedError = error as HttpError;
    return res.status(error.statusCode).json({
      message: error.message,
      ...(typedError.code ? { code: typedError.code } : {}),
      ...(typedError.details !== undefined ? { details: typedError.details } : {}),
      ...(typedError.entity ? { entity: typedError.entity } : {}),
      ...(typedError.action ? { action: typedError.action } : {})
    });
  }

  console.error(error);
  return res.status(500).json({ message: "Internal server error." });
}

