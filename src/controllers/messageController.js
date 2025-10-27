const messageService = require("../services/messageService");

// 🔹 Controller: Get messages between two users
exports.getMessages = async (req, res) => {
  try {
    const messages = await messageService.getMessages(req.params.userId, req.user.id);
    res.json(messages);
  } catch (err) {
    console.error("Get messages failed:", err);
    res.status(500).json({ error: err.message });
  }
};

// 🔹 Controller: Send message
exports.sendMessage = async (req, res) => {
  try {
    const { receiverId, content } = req.body;
    const newMessage = await messageService.sendMessage(req.user.id, receiverId, content);
    res.json(newMessage);
  } catch (err) {
    console.error("Send message failed:", err);
    res.status(400).json({ error: err.message });
  }
};

// 🔹 Controller: Mark messages as read
exports.markMessagesAsRead = async (req, res) => {
  try {
    await messageService.markMessagesAsRead(req.params.userId, req.user.id);
    res.json({ message: "Messages marked as read" });
  } catch (err) {
    console.error("Mark messages failed:", err);
    res.status(500).json({ error: err.message });
  }
};

// 🔹 Controller: Get chat contacts with unread count
exports.getChatContacts = async (req, res) => {
  try {
    const contacts = await messageService.getChatContacts(req.user.id);
    res.json(contacts);
  } catch (err) {
    console.error("Get contacts failed:", err);
    res.status(500).json({ error: err.message });
  }
};

// 🔹 Controller: Admin get all messages
exports.getAllMessages = async (req, res) => {
  try {
    // if (!req.user || req.user.roleid != 1) {
    //   return res.status(403).json({ error: "Admins only" });
    // }

    const data = await messageService.getAllMessages();
    res.json(data);
  } catch (err) {
    console.error("Get all messages failed:", err);
    res.status(500).json({ error: err.message });
  }
};

// 🔹 Controller: Get chat history
exports.getChatHistory = async (req, res) => {
  try {
    const history = await messageService.getChatHistory(req.user.id, req.params.otherUserId);
    res.json(history);
  } catch (err) {
    console.error("Get chat history failed:", err);
    res.status(500).json({ error: err.message });
  }
};

// 🔹 Controller: Admin delete message
exports.deleteMessage = async (req, res) => {
  try {
    if (!req.user || req.user.role !== "admin") {
      return res.status(403).json({ error: "Admins only" });
    }

    const result = await messageService.deleteMessage(req.params.messageId);
    res.json(result);
  } catch (err) {
    console.error("Delete message failed:", err);
    res.status(500).json({ error: err.message });
  }
};
