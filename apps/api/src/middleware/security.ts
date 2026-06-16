import type { NextFunction, Request, Response } from "express";
import { env } from "../config.js";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function isAllowedOrigin(value: string) {
  return env.WEB_ORIGINS.some((origin) => value === origin || value.startsWith(`${origin}/`));
}

export function csrfGuard(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }

  const origin = req.headers.origin ?? req.headers.referer;
  if (!origin || !isAllowedOrigin(origin)) {
    return res.status(403).json({ message: "Origin validation failed." });
  }

  return next();
}

