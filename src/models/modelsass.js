const User = require('./userModel');
const Class = require('./class');
const Course = require('./course');
const Enrollment = require('./enrollment');
const ClassSchedule = require('./classSchedule');
const Message = require('./messageModel');

// ============ ClassSchedule Associations ============
ClassSchedule.belongsTo(User, {
  foreignKey: "trainerId",
  as: "trainer",
});

ClassSchedule.belongsTo(User, {
  foreignKey: "studentId",
  as: "student",
});

ClassSchedule.belongsTo(Class, {
  foreignKey: "classId",
  as: "class",
});

ClassSchedule.belongsTo(Course, {
  foreignKey: "courseId",
  as: "course",
});

// ============ Class Associations ============
Class.belongsTo(Course, {
  foreignKey: 'CourseId',
  as: 'course',
});

Class.hasMany(ClassSchedule, {
  foreignKey: "classId",
  as: "schedules",
});

// ============ Course Associations ============
Course.hasMany(Class, {
  foreignKey: 'CourseId',
  as: 'classes',
});

Course.hasMany(Enrollment, {
  foreignKey: 'courseId',
  as: 'courseEnrollments',
});

Course.belongsTo(User, {
  foreignKey: 'TrainerId',
  as: 'trainer',
});

Course.hasMany(ClassSchedule, {
  foreignKey: "courseId",
  as: "schedules",
});

// ============ User Associations ============
User.hasMany(ClassSchedule, {
  foreignKey: "studentId",
  as: "studentSchedules",
});

User.hasMany(ClassSchedule, {
  foreignKey: "trainerId",
  as: "trainerSchedules",
});

User.hasMany(Course, {
  foreignKey: 'TrainerId',
  as: 'courses',
});

User.hasMany(Enrollment, {
  foreignKey: 'trainerId',
  as: 'trainerEnrollments',
});

User.hasMany(Enrollment, {
  foreignKey: 'studentId',
  as: 'studentEnrollments',
});

// ============ Enrollment Associations ============
Enrollment.belongsTo(User, {
  foreignKey: 'trainerId',
  as: 'trainer',
});

Enrollment.belongsTo(User, {
  foreignKey: 'studentId',
  as: 'student',
});

Enrollment.belongsTo(Course, {
  foreignKey: 'courseId',
  as: 'course',
});

module.exports = {
  User,
  Class,
  Course,
  Enrollment,
  ClassSchedule,
  Message,
};