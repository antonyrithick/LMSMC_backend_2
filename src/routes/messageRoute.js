const express = require("express");
const router = express.Router();


const { getMessages,  getChatContacts ,sendMessage, getAllMessages, getChatHistory,deleteMessage ,markMessagesAsRead} = require("../controllers/messageController");
const { verifyToken } = require("../middleware/socketAuth");

router.get("/messages/:userId", verifyToken, getMessages); 
router.post("/messages", verifyToken, sendMessage);
router.get("/admin/messages", verifyToken, getAllMessages);
router.post("/messages/read/:userId", verifyToken,markMessagesAsRead);
router.get("/history/:otherUserId", verifyToken, getChatHistory);
router.get("/contacts", verifyToken, getChatContacts);
router.delete("/delete/:messageId", verifyToken, deleteMessage);
module.exports = router;
