// models/course.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");
const CoursePriceOption = require("./courseOptionModel");

const Course = sequelize.define("Course", {
  title: DataTypes.STRING,
  description: DataTypes.TEXT,
  thumbnail: DataTypes.STRING,
  basePrice: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,  
  },
  rating: {
    type: DataTypes.FLOAT,
    defaultValue: 0.0,
  },
  duration: DataTypes.INTEGER, // total duration of all classes in minutes
  // 🛑 ADDED THIS MISSING COLUMN 🛑
  totalClasses: { 
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 10, // Default to 10 classes if not specified
  },
  TrainerId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: "Users",  // Your User model's table name
      key: "id",
    },
  },
});

// Assuming you have defined associations in separate files or in index.js for other models (like Class, Enrollment, User)
// If not, you might need to manually add them here to resolve controller includes:
/*
Course.associate = function(models) {
    Course.hasMany(models.Class, { as: 'classes', foreignKey: 'CourseId' });
    Course.hasMany(models.Enrollment, { as: 'courseEnrollments', foreignKey: 'courseId' });
    Course.belongsTo(models.User, { as: 'trainer', foreignKey: 'TrainerId' }); // Already covered by TrainerId reference
};
*/

Course.hasMany(CoursePriceOption, { as: "priceOptions", foreignKey: "courseId" });
CoursePriceOption.belongsTo(Course, { foreignKey: "courseId" });

module.exports = Course;