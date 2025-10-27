const User = require("./userModel");
const Role = require("./roleModel");
const Message = require("./messageModel");
const Course = require("./course");
const Class = require("./class");
const Enrollment = require("./enrollment");
const CoursePriceOption = require("./courseOptionModel");
const ClassSchedule = require("./classSchedule");

// -------------------- Associations --------------------

// User - Role
User.belongsTo(Role, { foreignKey: "RoleId" });
Role.hasMany(User, { foreignKey: "RoleId" });

// Course - Class
Course.hasMany(Class, { foreignKey: "CourseId", as: "classes", onDelete: "CASCADE" });
Class.belongsTo(Course, { foreignKey: "CourseId", as: "course" });

// Course - Enrollment
Course.hasMany(Enrollment, { foreignKey: "courseId", as: "courseEnrollments", onDelete: "CASCADE" });
Enrollment.belongsTo(Course, { foreignKey: "courseId", as: "course" });

// Course - Trainer (User)
Course.belongsTo(User, { as: "trainer", foreignKey: "TrainerId" });
User.hasMany(Course, { as: "coursesAsTrainer", foreignKey: "TrainerId" });

// Enrollment - Student (User)
Enrollment.belongsTo(User, { as: "student", foreignKey: "studentId" });
User.hasMany(Enrollment, { as: "enrollmentsAsStudent", foreignKey: "studentId" });

// Enrollment - Trainer (User)
Enrollment.belongsTo(User, { as: "trainer", foreignKey: "trainerId" });
User.hasMany(Enrollment, { as: "enrollmentsAsTrainer", foreignKey: "trainerId" });

// Enrollment - CoursePriceOption
Enrollment.belongsTo(CoursePriceOption, { as: "selectedOption", foreignKey: "selectedOptionId" });
CoursePriceOption.hasMany(Enrollment, { as: "optionEnrollments", foreignKey: "selectedOptionId" });

// Messages associations
Message.belongsTo(User, { as: "Sender", foreignKey: "senderId" });
Message.belongsTo(User, { as: "Receiver", foreignKey: "receiverId" });
User.hasMany(Message, { as: "SentMessages", foreignKey: "senderId" });
User.hasMany(Message, { as: "ReceivedMessages", foreignKey: "receiverId" });

// -------------------- ClassSchedule Associations --------------------

// ClassSchedule ↔ User (trainer)
ClassSchedule.belongsTo(User, { foreignKey: "trainerId", as: "trainer" });
User.hasMany(ClassSchedule, { foreignKey: "trainerId", as: "trainerSchedules" });

// ClassSchedule ↔ User (student)
ClassSchedule.belongsTo(User, { foreignKey: "studentId", as: "student" });
User.hasMany(ClassSchedule, { foreignKey: "studentId", as: "studentSchedules" });

// ClassSchedule ↔ Class
ClassSchedule.belongsTo(Class, { foreignKey: "classId", as: "class" });
Class.hasMany(ClassSchedule, { foreignKey: "classId", as: "schedules" });

// ClassSchedule ↔ Course
ClassSchedule.belongsTo(Course, { foreignKey: "courseId", as: "course" });
Course.hasMany(ClassSchedule, { foreignKey: "courseId", as: "classSchedules" });

// ------------------------------------------------------

module.exports = {
  User,
  Role,
  Message,
  Course,
  Class,
  Enrollment,
  CoursePriceOption,
  ClassSchedule,
};
