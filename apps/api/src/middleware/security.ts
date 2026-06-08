import type { NextFunction, Request, Response } from "express";
import { env } from "../config.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const origin = req.headers.origin ?? req.headers.referer;
  if (!origin || !origin.startsWith(env.WEB_URL)) {
    return res.status(403).json({ message: "Origin validation failed." });
  }

  return next();
}

