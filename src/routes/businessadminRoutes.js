const express = require("express");
const router = express.Router();
const businessAdminController = require("../controllers/bussnesadminController");
const enrollmentController = require("../controllers/enrollmentController");
const { verifyToken } = require("../middleware/socketAuth");

// Existing business admin routes
router.get("/student-reports", businessAdminController.getAllStudentReports);
router.get("/courses/:courseId/students", businessAdminController.getStudentsByCourse);
router.get("/trainers/assignments", businessAdminController.getTrainerAssignmentReports);
router.get("/trainers/assignment/:trainerId", businessAdminController.getTrainerAssignmentById);
router.get("/students/unassigned", businessAdminController.getUnassignedStudents);
router.get("/assignments/timeline", businessAdminController.getAssignmentTimeline);

// New routes for trainer assignment functionality

module.exports = router;