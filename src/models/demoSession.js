const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./userModel');
const DemoRequest = require('./demoRequest');

const DemoSession = sequelize.define('DemoSession', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  demoRequestId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'demo_requestss', // Fixed: removed extra 's'
      key: 'id',
    },
  },
  trainerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Users',
      key: 'id',
    },
  },
  scheduledDateTime: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  duration: {
    type: DataTypes.INTEGER, // in minutes
    defaultValue: 60,
  },
  status: {
    type: DataTypes.ENUM('scheduled', 'in_progress', 'completed', 'cancelled'),
    defaultValue: 'scheduled',
  },
  sessionNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  rating: {
    type: DataTypes.DECIMAL(2, 1), // e.g. 4.5
    allowNull: true,
  },
}, {
  tableName: 'demo_sessions', // Fixed: removed extra 's'
  timestamps: true,
  
  
});

// Define associations
DemoSession.belongsTo(DemoRequest, { foreignKey: 'demoRequestId' });
DemoSession.belongsTo(User, { as: 'Trainer', foreignKey: 'trainerId' });
DemoSession.belongsTo(User, { as: 'Student', foreignKey: 'studentId' });

module.exports = DemoSession;