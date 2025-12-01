const repo = require("../respositories/messageRepository");
const { clients } = require("../socket/socket");

exports.getMessages = (userId, currentUserId) => {
  return repo.findMessagesBetweenUsers(userId, currentUserId);
};

exports.sendMessage = async (senderId, receiverId, content) => {
  if (!receiverId || !content) {
    throw new Error("Missing fields");
  }

  const receiverUser = await repo.findUserById(receiverId);
  if (!receiverUser) {
    throw new Error("Receiver does not exist");
  }

  const isInappropriate = content.toLowerCase().includes("inappropriate");

  const newMessage = await repo.createMessage({
    senderId,
    receiverId,
    content,
    status: isInappropriate ? "flagged" : "delivered",
    priority: isInappropriate ? "high" : "normal",
    read: false,
  });

  const receiver = clients.get(receiverId);
  if (receiver?.ws) {
    receiver.ws.send(JSON.stringify({
      from: senderId,
      content,
      createdAt: newMessage.createdAt,
    }));
  }

  return newMessage;
};

exports.markMessagesAsRead = (senderId, receiverId) => {
  return repo.markMessagesAsRead(senderId, receiverId);
};

exports.getChatContacts = async (currentUserId) => {
  const messages = await repo.findAllUserMessages(currentUserId);
  const contactMap = new Map();

  messages.forEach((msg) => {
    const user = msg.senderId === currentUserId ? msg.Receiver : msg.Sender;
    if (!user) return;

    if (!contactMap.has(user.id)) {
      contactMap.set(user.id, {
        id: user.id,
        name: user.name,
        unreadCount: 0,
      });
    }

    if (msg.receiverId === currentUserId && !msg.read) {
      contactMap.get(user.id).unreadCount += 1;
    }
  });

  return Array.from(contactMap.values());
};

exports.getAllMessages = async () => {
  const messages = await repo.findAllMessagesAdmin();
  return messages.map((msg) => ({
    id: msg.id,
    senderName: msg.Sender?.name || "Unknown",
    senderRole: msg.Sender?.Role?.name || "-",
    receiverName: msg.Receiver?.name || "Unknown",
    receiverRole: msg.Receiver?.Role?.name || "-",
    preview: msg.content.slice(0, 100),
    length: msg.content.length,
    status: msg.status,
    priority: msg.priority,
    read: msg.read,
    timestamp: msg.createdAt,
  }));
};

exports.getChatHistory = (currentUserId, otherUserId) => {
  return repo.findChatHistory(currentUserId, otherUserId);
};

exports.deleteMessage = async (messageId) => {
  const message = await repo.findMessageById(messageId);
  if (!message) {
    throw new Error("Message not found");
  }
  await repo.deleteMessage(message);
  return { message: "Message deleted successfully" };
};
