const sequelize = require("../config/db");
const Role = require("./roleModel");
const User = require("./userModel");
const Enrollment = require("./enrollment");
const Course = require("./course");
const CoursePriceOption = require("./courseOptionModel");
const DemoSession = require("./demoSession");
const TrainerAvailability = require("./trainerAvailability");


// Associations
Role.hasMany(User, { foreignKey: "roleId" });

(async () => {
  try {
    await sequelize.authenticate();
    console.log("✅ Database connected!");

    // Sync all models
    await sequelize.sync({ alter: true });
    console.log("✅ All tables synced");

    // Sync DemoSession separately if needed
    await DemoSession.sync({ alter: true });
    console.log("✅ DemoSession table synced!");
     await TrainerAvailability.sync({ alter: true });
    console.log("✅ Trainer table synced!");

    // Seed roles
    const roles = ["super admin", "business admin", "technical admin", "trainer", "student"];
    for (const name of roles) {
      await Role.findOrCreate({ where: { name } });
    }
    console.log("✅ Roles seeded");
  } catch (err) {
    console.error("❌ Sync error:", err);
  }
})();

module.exports = { sequelize, Role, User, Enrollment, Course, CoursePriceOption ,TrainerAvailability};
