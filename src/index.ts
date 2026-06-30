import express from "express";
import dotenv from "dotenv";
import config from "./config";
import bodyParser from "body-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { connectToMongo } from "./db";
import tenantRoutes from "./routes/tenantRoutes";
import managerRoutes from "./routes/managerRoutes";
import propertyRoutes from "./routes/propertyRoutes";
import adminRoutes from "./routes/adminRoutes";
import leaseRoutes from "./routes/leaseRoutes";
import applicationRoutes from "./routes/applicationRoutes";
import chatRoutes from "./routes/chatRoutes";
import authRoutes from "./routes/authRoutes";
import paymentRoutes from "./routes/paymentRoutes";
import ratingRoutes from "./routes/ratingRoutes";
import notificationRoutes from "./routes/notificationRoutes";

/* CONFIGURATIONS */
// `config` already loaded and validated `.env` at import time
let isMongoConnected = false;
const app = express();
app.use(express.json());
app.use(helmet());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(morgan("common"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());


/* ROUTES */
app.get("/", (req, res) => {
  const serverStatus = isMongoConnected ? "Online" : "Partial Connectivity";
  const statusColor = isMongoConnected ? "rgba(34, 197, 94, 0.12)" : "rgba(245, 158, 11, 0.12)";
  const statusTextColor = isMongoConnected ? "#a7f3d0" : "#fbbf24";
  const connectionMessage = isMongoConnected
    ? "This service is running and connected to MongoDB."
    : "The server is running, but MongoDB is not connected.";

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Homerent Server Status</title>
        <style>
          body { font-family: Inter, system-ui, sans-serif; background: #0f172a; color: #e2e8f0; margin: 0; display: flex; min-height: 100vh; align-items: center; justify-content: center; }
          .card { background: rgba(15, 23, 42, 0.92); border: 1px solid rgba(148, 163, 184, 0.18); border-radius: 24px; padding: 36px; max-width: 520px; text-align: center; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.35); }
          h1 { margin: 0 0 16px; font-size: 2rem; color: #f8fafc; }
          p { margin: 0 0 24px; line-height: 1.75; color: #cbd5e1; }
          .status { display: inline-flex; align-items: center; gap: 10px; padding: 12px 18px; border-radius: 999px; background: ${statusColor}; color: ${statusTextColor}; font-weight: 600; }
          .links { display: grid; gap: 12px; margin-top: 24px; }
          .link { display: inline-block; text-decoration: none; padding: 12px 18px; border-radius: 14px; background: #0f172a; border: 1px solid rgba(148, 163, 184, 0.16); color: #f8fafc; transition: transform 0.2s ease, background 0.2s ease; }
          .link:hover { transform: translateY(-1px); background: rgba(148, 163, 184, 0.14); }
          .small { color: #94a3b8; margin-top: 20px; font-size: 0.95rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <h1>Homerent Server</h1>
          <div class="status">${serverStatus}</div>
          <p>${connectionMessage}</p>
          <div class="links">
            <a class="link" href="/properties">Properties API</a>
            <a class="link" href="/auth">Auth API</a>
          </div>
          <div class="small">If the server is down, check your Railway logs for MongoDB connection issues.</div>
        </div>
      </body>
    </html>
  `);
});

app.use("/applications", applicationRoutes);
app.use("/properties", propertyRoutes);
app.use("/ratings", ratingRoutes);
app.use("/leases", leaseRoutes);
app.use("/payments", paymentRoutes);
app.use("/notifications", notificationRoutes);

app.use("/chats", chatRoutes);
// Tenants routes - auth handled individually per endpoint, not globally
app.use("/tenants", tenantRoutes);
app.use("/managers", managerRoutes);
app.use("/auth", authRoutes);
app.use("/admin", adminRoutes);

const port = config.port;

const startServer = (currentPort: number) => {
  const server = app.listen(currentPort, "0.0.0.0", () => {
    console.log(`Server running on port ${currentPort}`);
  });

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.warn(`Port ${currentPort} is busy. Trying ${currentPort + 1} instead...`);
      server.close();
      startServer(currentPort + 1);
      return;
    }

    console.error("Could not start server", err);
    process.exit(1);
  });
};

connectToMongo()
  .then(() => {
    isMongoConnected = true;
    startServer(port);
  })
  .catch((err) => {
    console.error("Could not start server because MongoDB connection failed", err);
    isMongoConnected = false;
    startServer(port);
  });
