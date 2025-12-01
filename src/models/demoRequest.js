const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./userModel');
const Course = require('./course');

const DemoRequest = sequelize.define('DemoRequest', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  studentName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  courseId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: Course,
      key: 'id',
    },
  },
  requestMessage: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  preferredDateTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected', 'completed'),
    defaultValue: 'pending',
  },
  assignedTrainerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: User,
      key: 'id',
    },
  },
  approvedBy: {
    type: DataTypes.INTEGER,
    allowNull: true,
       references: {
    model: "Users",  // or "admins"
    key: "id"
  }
  },


  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  rejectionReason: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  scheduledDateTime: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  demoNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'demo_requestss',
  timestamps: true,
});
module.exports = DemoRequest;
// Define associations
DemoRequest.belongsTo(User, { as: 'Student', foreignKey: 'studentId' });
DemoRequest.belongsTo(Course, { foreignKey: 'courseId' });
DemoRequest.belongsTo(User, { as: 'AssignedTrainer', foreignKey: 'assignedTrainerId' });
DemoRequest.belongsTo(User, { as: 'ApprovedByAdmin', foreignKey: 'approvedBy' });
