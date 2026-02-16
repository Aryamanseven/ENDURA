import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { clerkMiddleware } from "@clerk/express";
import authRoutes from "./routes/auth.js";
import runRoutes from "./routes/runs.js";
import certificateRoutes from "./routes/certificates.js";
import accountRoutes from "./routes/account.js";

const app = express();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 80,
  standardHeaders: true,
  legacyHeaders: false
});

app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",") : true,
    credentials: true
  })
);
app.use(express.json());

// Clerk middleware – reads Bearer <clerk-session-token> and populates req.auth
app.use(clerkMiddleware());

app.get("/health", (_, res) => {
  res.json({ status: "ok", service: "endura-server" });
});

app.use("/api/auth", authLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/runs", runRoutes);
app.use("/api/certificates", certificateRoutes);
app.use("/api/account", accountRoutes);

const port = Number(process.env.PORT || 5000);

async function bootstrap() {
  try {
    app.listen(port, () => {
      console.log(`ENDURA server running on port ${port}`);
    });
  } catch (error) {
    console.error("Failed to start server", error);
    process.exit(1);
  }
}

bootstrap();
