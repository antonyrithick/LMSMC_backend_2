const express = require("express");
const router = express.Router();
const enrollmentController = require("../controllers/enrollmentController");
const { verifyToken } = require("../middleware/socketAuth");

// Razorpay payment & enrollment
router.post("/order", enrollmentController.createOrder);
router.post("/verify", enrollmentController.verifyAndCreateEnrollment);

// Enrollment CRUD
router.post("/student-enrollments", enrollmentController.getStudentEnrollments);
router.get("/", enrollmentController.getAllEnrollments);
router.get("/payment", enrollmentController.getAllPayments);
router.get("/enrollexport",enrollmentController.getAllPaymentsExport);
router.get("/sixmonth-report",verifyToken,enrollmentController.getsixmonthReports);
router.get("/:id", enrollmentController.getEnrollmentById);



router.post("/assign-trainer", verifyToken, enrollmentController.assignTrainer);
router.get("/pending-assignments", enrollmentController.getPendingAssignments);
router.get("/available-trainers", enrollmentController.getAvailableTrainers);


// Progress update
router.put("/:enrollmentId/progress", enrollmentController.updateProgress);



module.exports = router;
