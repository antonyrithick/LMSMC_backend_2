// routes/coursesRoutes.js
const express = require("express");
const router = express.Router();
const controller = require("../controllers/coursesController");
const upload = require("../middleware/upload");
const { verifyToken } = require("../middleware/socketAuth");

// ========================= COURSE MANAGEMENT ROUTES =========================

// ✅ Create course (with token verification and file upload)


router.post(
  "/creates",
  verifyToken,
  upload.fields([
    { name: "courseThumbnail", maxCount: 1 },
    ...Array.from({ length: 20 }, (_, i) => ({
      name: `classThumbnail${i}`,
      maxCount: 1,
    })),
  ]),
  controller.createCourse
);

// ✅ Get all courses (usually public, no token required)
router.get("/all", controller.getAllCourses);

// ✅ Get course options/pricing
router.get("/courseoptions", controller.getCourseOptions);

// ✅ Get single course (usually public, no token required)
router.get("/all/:id", controller.getCourse);

// ✅ Update course (protected)
router.put("/edit/:id", verifyToken, controller.updateCourse);

// ✅ Delete course (protected)
router.delete("/delete/:id", verifyToken, controller.deleteCourse);

// ✅ Enroll student (protected)
router.post("/:id/enroll", verifyToken, controller.enrollStudent);

// ✅ Get active/enrolled courses for logged-in student (protected)
router.get("/active", verifyToken, controller.getActiveCoursesForStudent);

// ✅ Get trainers for student courses
router.get("/:studentid/trainers", verifyToken, controller.getTrainersForStudentCourses);

// ✅ Get students for trainer courses
router.get("/:trainerid/students", verifyToken, controller.getStudentsForTrainer);


// ========================= CLASS SCHEDULE ROUTES =========================

// ✅ Get student's enrolled courses and classes (Trainer selects from these to allocate)
router.get(
  "/student/:studentId/enrolled-classes",
  verifyToken,
  controller.getStudentEnrolledClasses
);

// ✅ Allocate single class to student (Trainer only)
router.post(
  "/allocate-class",
  verifyToken,
  controller.allocateClassToStudent
);

// ✅ Bulk allocate multiple classes to student (Trainer only)
router.post(
  "/bulk-allocate-classes",
  verifyToken,
  controller.bulkAllocateClasses
);

// ✅ Get schedules for a specific student
router.get(
  "/schedules/student/:studentId",
  verifyToken,
  controller.getStudentSchedules
);

// ✅ Get schedules for all students (if needed)
router.get(
  "/schedules/student",
  verifyToken,
  controller.getStudentSchedules
);

// ✅ Get schedules for a specific trainer
router.get(
  "/schedules/trainer/:trainerId",
  verifyToken,
  controller.getTrainerSchedules
);

// ✅ Get schedules for all trainers (if needed)
router.get(
  "/schedules/trainer",
  verifyToken,
  controller.getTrainerSchedules
);

// ✅ Get single schedule by ID
router.get(
  "/schedule/:scheduleId",
  verifyToken,
  controller.getScheduleById
);



router.get(
  "/reports/trainer/:trainerId",
  verifyToken,
  controller.getreports
);

// ✅ Update schedule (date, time, status, notes)
router.put(
  "/schedule/:scheduleId",
  verifyToken,
  controller.updateSchedule
);

router.delete(
  "/schedule/:scheduleId",
  verifyToken,
  controller.deleteSchedule
);



module.exports = router;
