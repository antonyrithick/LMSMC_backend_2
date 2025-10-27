const { Op } = require("sequelize");
const { Message, User, Role } = require("../models/associations");

exports.findMessagesBetweenUsers = (user1, user2) => {
  return Message.findAll({
    where: {
      [Op.or]: [
        { senderId: user1, receiverId: user2 },
        { senderId: user2, receiverId: user1 }
      ]
    },
    order: [['createdAt', 'ASC']]
  });
};

exports.createMessage = (data) => {
  return Message.create(data);
};

exports.findUserById = (id) => {
  return User.findByPk(id);
};

exports.markMessagesAsRead = (senderId, receiverId) => {
  return Message.update(
    { read: true, status: "read" },
    {
      where: {
        senderId,
        receiverId,
        read: false
      }
    }
  );
};

exports.findAllUserMessages = (userId) => {
  return Message.findAll({
    where: {
      [Op.or]: [{ senderId: userId }, { receiverId: userId }]
    },
    include: [
      { model: User, as: "Sender", attributes: ["id", "name"] },
      { model: User, as: "Receiver", attributes: ["id", "name"] }
    ],
    order: [["createdAt", "DESC"]]
  });
};

exports.findAllMessagesAdmin = () => {
  return Message.findAll({
    order: [["createdAt", "DESC"]],
    include: [
      {
        model: User,
        as: "Sender",
        attributes: ["id", "name"],
        include: [{ model: Role, attributes: ["name"] }]
      },
      {
        model: User,
        as: "Receiver",
        attributes: ["id", "name"],
        include: [{ model: Role, attributes: ["name"] }]
      }
    ]
  });
};

exports.findChatHistory = (user1, user2) => {
  return Message.findAll({
    where: {
      [Op.or]: [
        { senderId: user1, receiverId: user2 },
        { senderId: user2, receiverId: user1 }
      ]
    },
    order: [['createdAt', 'ASC']],
    attributes: ['id', 'senderId', 'receiverId', 'content', 'createdAt', 'status', 'priority', 'read'],
    include: [
      {
        model: User,
        as: 'Sender',
        attributes: ['id', 'name'],
        include: [{ model: Role, attributes: ['name'] }]
      },
      {
        model: User,
        as: 'Receiver',
        attributes: ['id', 'name'],
        include: [{ model: Role, attributes: ['name'] }]
      }
    ]
  });
};

exports.findMessageById = (id) => {
  return Message.findByPk(id);
};

exports.deleteMessage = (message) => {
  return message.destroy();
};
