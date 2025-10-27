const sequelize = require("../config/db");
const { DataTypes } = require("sequelize");
const Role = require("./roleModel");
const Enrollment = require("./enrollment");

const User = sequelize.define("User", {
  name: DataTypes.STRING,
  email: { type: DataTypes.STRING, unique: true },
  mobile: { type: DataTypes.STRING, unique: true },
  password: DataTypes.STRING,
   active: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  }, 
  specialist: DataTypes.STRING,
  
});

User.belongsTo(Role);
User.hasMany(Enrollment, { foreignKey: "studentId", as: "enrollments" });

module.exports = User;
