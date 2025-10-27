
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const User = require("./userModel"); 

const Message = sequelize.define("Message", {
  senderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: "id"
    },
    onUpdate: "CASCADE",
    onDelete: "NO ACTION"
  },
  receiverId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: "id"
    },
    onUpdate: "CASCADE",
    onDelete: "NO ACTION"
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  status: {
    type: DataTypes.ENUM("sent", "delivered", "read", "flagged"),
    defaultValue: "sent"
  },
  priority: {
    type: DataTypes.ENUM("low", "normal", "high"),
    defaultValue: "normal"
  },
  read: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: "Messages",
  timestamps: true
});



module.exports = Message;
