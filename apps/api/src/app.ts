import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { fileURLToPath } from "node:url";
import { env } from "./config.js";
import authRoutes from "./routes/auth.js";
import catalogRoutes from "./routes/catalog.js";
import customerRoutes from "./routes/customer.js";
import adminRoutes from "./routes/admin.js";
import opsRoutes from "./routes/ops.js";
import posRoutes from "./routes/pos.js";
import { csrfGuard } from "./middleware/security.js";
import { notFound } from "./middleware/not-found.js";
import { errorHandler } from "./middleware/error-handler.js";

const API_PUBLIC_UPLOADS_DIR = fileURLToPath(new URL("../public/uploads/", import.meta.url));
const LEGACY_WEB_PUBLIC_IMAGES_DIR = fileURLToPath(new URL("../../web/public/images/", import.meta.url));

export function createApp() {
  const app = express();
  const allowedOrigins = new Set(env.WEB_ORIGINS);

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.has(origin)) {
          return callback(null, true);
        }

        return callback(new Error("Not allowed by CORS"), false);
      },
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
  app.use(express.json({ limit: "20mb" }));
  app.use("/uploads", express.static(API_PUBLIC_UPLOADS_DIR));
  app.use("/uploads/images", express.static(LEGACY_WEB_PUBLIC_IMAGES_DIR));
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
  app.use("/api/ops", opsRoutes);
  app.use("/api/pos", posRoutes);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}
