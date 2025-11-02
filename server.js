const express = require("express");
const http = require("http");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const { sequelize } = require("./src/models");
const router = require("./src/routes/index");
const { setupWebSocket } = require("./src/socket/socket");

const app = express();
const server = http.createServer(app);

// ===== Middleware =====
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(bodyParser.json({ limit: "20mb" }));
app.use(bodyParser.urlencoded({ limit: "20mb", extended: true }));

// ===== Static file serving (e.g., uploads) =====
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ===== Routes =====
app.use("/api", router);

// ===== Health check route (required by Render) =====
app.get("/", (req, res) => {
  res.status(200).send("✅ LMS Backend is live and healthy!");
});

// ===== Server and DB =====
const PORT = process.env.PORT || 5000;

sequelize.authenticate()
  .then(async () => {
    console.log("✅ Database connected!");

    // Optional: Sync models (only if needed)
    await sequelize.sync();

    // Initialize WebSocket
    setupWebSocket(server);

    // Start HTTP server on Render’s port
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Database connection error:", err);
  });
