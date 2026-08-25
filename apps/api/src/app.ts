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

  // The public site proxies /api requests through Next.js in production. Trust
  // that immediate proxy so the limiter uses the visitor's forwarded address,
  // rather than treating every customer and staff member as one local address.
  app.set("trust proxy", env.TRUST_PROXY);

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
      limit: 3_000,
      standardHeaders: true,
      legacyHeaders: false,
      // Sign-in requests have their own failed-attempt limiter below. Keeping
      // them out of this broad API limit prevents normal staff sign-ins from
      // being blocked by high public storefront traffic.
      skip: (req) => req.path.startsWith("/api/auth/")
    })
  );
  app.use(morgan("dev"));
  app.use(cookieParser());
  app.use(express.json({ limit: "100mb" }));
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
