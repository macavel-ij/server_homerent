import path from "path";
import dotenv from "dotenv";

// Load .env from the server folder first, then fall back to the shared client .env.local file.
const serverEnvPath = path.resolve(process.cwd(), ".env");
const workspaceRoot = path.resolve(process.cwd(), "..");
const clientEnvPath = path.resolve(workspaceRoot, "client", ".env.local");

dotenv.config({ path: serverEnvPath });
dotenv.config({ path: clientEnvPath });

function required(name: string, value?: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return value;
}

const nodeEnv = process.env.NODE_ENV || "development";

// In development, allow a sensible default to avoid crashing when .env is missing.
const defaultLocalMongo = "mongodb://localhost:27017/realestate";

const config = {
  mongodbUri:
    process.env.MONGODB_URI || (nodeEnv === "production" ? required("MONGODB_URI", process.env.MONGODB_URI) || defaultLocalMongo : defaultLocalMongo),
  port: Number(process.env.PORT || 3002),
  nodeEnv,
  cloudinary: {
    url: process.env.CLOUDINARY_URL || undefined,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME || undefined,
    apiKey: process.env.CLOUDINARY_API_KEY || undefined,
    apiSecret: process.env.CLOUDINARY_API_SECRET || undefined,
  },
  jwtSecret: process.env.JWT_SECRET || (nodeEnv === "production" ? undefined : "dev-secret"),
  logLevel: process.env.LOG_LEVEL || "info",
};

if (nodeEnv !== "production") {
  if (!process.env.MONGODB_URI) {
    console.warn(`MONGODB_URI not set — falling back to ${defaultLocalMongo}`);
  }
} else {
  if (!config.mongodbUri) {
    console.error("Missing MONGODB_URI in production. Set it in .env.");
    process.exit(1);
  }
}

export default config;
