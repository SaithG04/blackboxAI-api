const express = require("express");
const { askBlackbox } = require("./askBlackbox");
const {
  launchBrowser,
  warmupPool,
  closeBrowser,
  getBrowserInstance,
} = require("./browserManager");
const rateLimit = require("express-rate-limit");
const helmet = require("helmet");
const cors = require("cors");
const logger = require("./logger");
//const cluster = require("cluster");
//const numCPUs = require("os").cpus().length;

const app = express();

/*
// Configuración para clusters
if (cluster.isMaster && process.env.NODE_ENV !== "test") {
  logger.info(`Master ${process.pid} is running`);

  // Fork workers
  for (let i = 0; i < Math.min(numCPUs, 2); i++) {
    cluster.fork();
  }

  cluster.on("exit", (worker, code, signal) => {
    logger.warn(`Worker ${worker.process.pid} died. Restarting...`);
    cluster.fork();
  });

  return;
}*/

// Middlewares de seguridad
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "10kb" }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  handler: (req, res) => {
    logger.warn(`Rate limit exceeded for IP: ${req.ip}`);
    res.status(429).json({
      error: "Too many requests, please try again later",
    });
  },
});
app.use("/ask", limiter);

// Middleware de logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = Date.now() - start;
    logger.http(
      `${req.method} ${req.originalUrl} - ${res.statusCode} ${duration}ms`
    );
  });
  next();
});

// Endpoint principal
app.post("/ask", async (req, res, next) => {
  try {
    const { prompt } = req.body;

    if (!prompt || typeof prompt !== "string" || prompt.trim().length === 0) {
      logger.warn("Invalid prompt received");
      return res
        .status(400)
        .json({ error: "Prompt is required and must be a non-empty string" });
    }

    logger.info(`Processing prompt (length: ${prompt.length})`);

    const response = await askBlackbox(prompt);

    res.json({
      success: true,
      response,
      timestamp: new Date().toISOString(),
      workerId: process.pid,
    });
  } catch (error) {
    logger.error(`Error processing request: ${error.stack}`);
    next(error);
  }
});

// Health check endpoint
app.get("/health", async (req, res) => {
  try {
    const healthStatus = {
      status: "healthy",
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      timestamp: new Date().toISOString(),
      workerId: process.pid,
      poolSize: pagePool.length,
      hasBrowser: !!browserInstance,
    };

    await warmupPool();
    res.status(200).json(healthStatus);
  } catch (error) {
    logger.error("Health check failed:", error);
    res.status(500).json({
      status: "unhealthy",
      error: error.message,
      workerId: process.pid,
    });
  }
});

// Manejo de errores centralizado
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.stack}`);
  res.status(500).json({
    error: "Internal Server Error",
    workerId: process.pid,
  });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, async () => {
  logger.info(`Worker ${process.pid} started on port ${PORT}`);

  try {
    await launchBrowser();
    const browser = getBrowserInstance();

    if (!browser) {
      throw new Error("Browser failed to initialize");
    }

    logger.info("Blackbox is ready to receive requests");
  } catch (error) {
    logger.error(`Startup failed: ${error.message}`);
    process.exit(1);
  }
});

// Manejo de cierre limpio
const shutdown = async (signal) => {
  logger.info(
    `Worker ${process.pid} received ${signal}, shutting down gracefully...`
  );

  try {
    await closeBrowser();
    server.close(() => {
      logger.info(`Worker ${process.pid} server closed`);
      process.exit(0);
    });

    setTimeout(() => {
      logger.error(`Worker ${process.pid} forcing shutdown after timeout`);
      process.exit(1);
    }, 5000);
  } catch (err) {
    logger.error(`Worker ${process.pid} error during shutdown:`, err);
    process.exit(1);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (err) => {
  logger.error(`Uncaught exception: ${err.stack}`);
});
