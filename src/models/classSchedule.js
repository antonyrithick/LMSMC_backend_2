const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const ClassSchedule = sequelize.define("ClassSchedule", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  trainerId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "Users",
      key: "id",
    },
  },
  studentId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "Users",
      key: "id",
    },
  },
  classId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "Classes",
      key: "id",
    },
  },
  courseId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: "Courses",
      key: "id",
    },
  },
  scheduledDate: {
    type: DataTypes.DATEONLY,
    allowNull: true,
  },
  scheduledTime: {
    type: DataTypes.TIME,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM("scheduled", "completed", "cancelled", "rescheduled"),
    defaultValue: "scheduled",
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  completedAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  // Google Meet Integration Fields
  meetLink: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: "Google Meet video conference link",
  },
  googleEventId: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: "Google Calendar Event ID for syncing",
  },
}, {
  tableName: "ClassSchedules",
  timestamps: true,
});

ClassSchedule.associate = (models) => {
  ClassSchedule.belongsTo(models.User, {
    foreignKey: "trainerId",
    as: "trainer",
  });

  ClassSchedule.belongsTo(models.User, {
    foreignKey: "studentId",
    as: "student",
  });

  ClassSchedule.belongsTo(models.Class, {
    foreignKey: "classId",
    as: "class",
  });

  ClassSchedule.belongsTo(models.Course, {
    foreignKey: "courseId",
    as: "course",
  });
};

module.exports = ClassSchedule;