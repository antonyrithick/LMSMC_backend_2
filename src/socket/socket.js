const WebSocket = require("ws");
const jwt = require("jsonwebtoken");
const clients = new Map();

function setupWebSocket(server) {
  const wss = new WebSocket.Server({ server });

  wss.on("connection", (ws, req) => {
    const token = req.url.split("?token=")[1];
    let user;
    try {
      user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      ws.close();
      return;
    }

    // Save socket by user ID
    clients.set(user.id, { ws, role: user.role });
    console.log(`WebSocket connected: ${user.id} (${user.role})`);

    ws.on("close", () => {
      clients.delete(user.id);
      console.log(` WebSocket disconnected: ${user.id}`);
    });
  });
}

module.exports = { setupWebSocket, clients };
