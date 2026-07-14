import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(currentDirectory, "../../../.env") });
dotenv.config();

const envSchema = z.object({
  API_PORT: z.coerce.number().default(4000),
  DATABASE_URL: z.string().min(1),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  WEB_ORIGINS: z.string().optional(),
  API_URL: z.string().url().default("http://localhost:4000"),
  JWT_SECRET: z.string().min(16),
  JWT_EXPIRES_IN: z.string().default("7d"),
  INITIAL_ADMIN_EMAIL: z.string().email().optional(),
  INITIAL_ADMIN_PASSWORD: z.string().min(8).optional()
});

const parsedEnv = envSchema.parse(process.env);

function parseWebOrigins(webOrigins: string | undefined, webUrl: string) {
  const explicitOrigins = webOrigins
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean) ?? [];

  const defaultOrigins = [
    "https://pocketpakistan.com",
    "https://www.pocketpakistan.com",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ];

  return Array.from(new Set([webUrl, ...explicitOrigins, ...defaultOrigins]));
}

export const env = {
  ...parsedEnv,
  WEB_ORIGINS: parseWebOrigins(parsedEnv.WEB_ORIGINS, parsedEnv.WEB_URL)
};
