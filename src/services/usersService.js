const User = require("../models/userModel");
const Enrollment = require("../models/enrollment");
const { Op } = require("sequelize");

exports.getRolesWithCount = async (roleId = 1) => {
  try {
    if (roleId === 4) {
      // 1️⃣ Fetch all trainers
      const trainers = await User.findAll({
        where: { RoleId: 4 },
        attributes: ["id", "name", "email"]
      });

      // 2️⃣ Fetch student counts per trainer using GROUP BY
      const studentCounts = await Enrollment.findAll({
        attributes: [
          "trainerId",
          [Enrollment.sequelize.fn("COUNT", Enrollment.sequelize.col("studentId")), "studentsHandled"]
        ],
        group: ["trainerId"],
        raw: true,
        where: {
          trainerId: { [Op.ne]: null } // only count valid trainers
        }
      });

      // 3️⃣ Map trainerId → studentsHandled
      const countMap = {};
      studentCounts.forEach((c) => {
        countMap[c.trainerId] = parseInt(c.studentsHandled, 10);
      });

      // 4️⃣ Prepare final trainers array
      const trainersWithCounts = trainers.map((t) => ({
        id: t.id,
        name: t.name,
        email: t.email,
        studentsHandled: countMap[t.id] || 0
      }));

      return {
        trainers: trainersWithCounts,
        totalTrainers: trainers.length
      };
    } else {
      // For other roles, simple user count
      const users = await User.findAll({ where: { RoleId: roleId } });
      return {
        userCount: users,
        totalCount: users.length
      };
    }
  } catch (error) {
    console.error("Error fetching role counts:", error);
    throw error;
  }
};
