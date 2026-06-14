import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { env } from "./config.js";
import authRoutes from "./routes/auth.js";
import catalogRoutes from "./routes/catalog.js";
import customerRoutes from "./routes/customer.js";
import adminRoutes from "./routes/admin.js";
import posRoutes from "./routes/pos.js";
import { csrfGuard } from "./middleware/security.js";
import { notFound } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.WEB_URL,
      credentials: true
    })
  );
  app.use(
    helmet({
      crossOriginResourcePolicy: false
    })
  );
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 500,
      standardHeaders: true,
      legacyHeaders: false
    })
  );
  app.use(morgan("dev"));
  app.use(cookieParser());
  app.use(express.json({ limit: "1mb" }));
  app.use(csrfGuard);

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "pocket-api",
      timestamp: new Date().toISOString()
    });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api", catalogRoutes);
  app.use("/api/customer", customerRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/pos", posRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

