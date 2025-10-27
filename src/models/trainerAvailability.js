const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const User = require('./userModel');

const TrainerAvailability = sequelize.define('TrainerAvailability', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  trainerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: User,
      key: 'id',
    },
  },
  dayOfWeek: {
    type: DataTypes.ENUM('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'),
    allowNull: false,
    validate: {
    isIn: [['monday','tuesday','wednesday','thursday','friday','saturday','sunday']]
  }
  },
  startTime: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  endTime: {
    type: DataTypes.TIME,
    allowNull: false,
  },
  isAvailable: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  maxStudentsPerSlot: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
  },
}, {
  tableName: 'trainer_availability',
  timestamps: true,
});
module.exports = TrainerAvailability;

// Define associations
TrainerAvailability.belongsTo(User, { as: 'Trainer', foreignKey: 'trainerId' });
User.hasMany(TrainerAvailability, { as: 'Availability', foreignKey: 'trainerId' });

