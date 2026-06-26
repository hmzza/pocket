import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

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
    return res.status(error.statusCode).json({ message: error.message });
  }

  console.error(error);
  return res.status(500).json({ message: "Internal server error." });
}

