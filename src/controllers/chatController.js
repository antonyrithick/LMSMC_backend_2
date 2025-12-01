const { Op } = require("sequelize");
const Message = require("../models/messageModel");
const { clients } = require("../socket/socket");

exports.getMessages = async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.user.id;

  try {
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: currentUserId, receiverId: userId },
          { senderId: userId, receiverId: currentUserId },
        ]
      },
      order: [['createdAt', 'ASC']],
    });

    res.json(messages);
  } catch (err) {
    console.error("Failed to fetch messages:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const senderId = req.user.id;
    const { receiverId, content } = req.body;

    if (!receiverId || !content) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const newMessage = await Message.create({
      senderId,
      receiverId,
      content,
    });

    const receiver = clients.get(receiverId);
    if (receiver && receiver.ws) {
      receiver.ws.send(
        JSON.stringify({
          from: senderId,
          content,
          createdAt: newMessage.createdAt,
        })
      );
    }

    res.json(newMessage);
  } catch (err) {
    console.error("Failed to send message:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
};

exports.getAllMessages = async (req, res) => {
  try {

    // Check if the user is admin
    if (!req.user || req.user.roleid !==1 ||req.user.roleid !==2) {
    if (!req.user || req.user.roleid !== 1 ||req.user.roleid !==2) {
      return res.status(403).json({ error: "Access denied. Admins only." });
    }
    
    const messages = await Message.findAll({
      order: [['createdAt', 'ASC']],
    });

    res.json(messages);
  } 
}catch (err) {
    console.log("Failed to fetch all messages:", err);
    res.status(500).json({ error: "Failed to fetch all messages" });
  }
}

exports.getChatHistory = async (req, res) => {
  const { otherUserId } = req.params;
  const currentUserId = req.user.id;

  try {
    const messages = await Message.findAll({
      where: {
        [Op.or]: [
          { senderId: currentUserId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: currentUserId }
        ]
      },
      order: [['createdAt', 'ASC']],
      attributes: ['senderId', 'receiverId', 'content', 'createdAt']
    });

    res.json(messages);
  } catch (err) {
    console.error("Failed to fetch chat history:", err);
    res.status(500).json({ error: "Failed to fetch chat history" });
  }
};
