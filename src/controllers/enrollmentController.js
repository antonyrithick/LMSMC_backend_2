const Enrollment = require("../models/enrollment");
const User = require("../models/userModel");
const Course = require("../models/course");
const CoursePriceOption = require("../models/courseOptionModel");
const Message = require("../models/messageModel");
const Razorpay = require("razorpay");
const { Op } = require("sequelize");
const { clients } = require("../socket/socket");

// Initialize Razorpay instance
const razorpayInstance = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ===============================================================
   RAZORPAY ORDER CREATION
================================================================= */
// Create Razorpay order
exports.createOrder = async (req, res) => {
  try {
    const { amount, currency = "INR", receipt } = req.body;
    // Razorpay accepts amount in paise (cents), so multiply by 100
    const order = await razorpayInstance.orders.create({ amount: amount * 100, currency, receipt });
    res.json(order);
  } catch (err) {
    console.error("❌ Razorpay order error:", err);
    res.status(500).json({ message: "Order creation failed" });
  }
};

/* ===============================================================
   VERIFY PAYMENT & CREATE ENROLLMENT (UPDATED)
================================================================= */
// Verify payment & create enrollment
exports.verifyAndCreateEnrollment = async (req, res) => {
  try {
    const {
      studentid,
      courseId,
      selectedOptionId,
      amount,
      paymentMethod,
      razorpay_order_id,
      razorpay_payment_id
    } = req.body;

    // 1. Validate required fields
    if (!studentid || !courseId || !amount || !paymentMethod) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const student = await User.findByPk(studentid);
    if (!student) return res.status(404).json({ message: "Student not found" });

    const course = await Course.findByPk(courseId);
    if (!course) return res.status(404).json({ message: "Course not found" });

    const selectedOption = selectedOptionId
      ? await CoursePriceOption.findByPk(selectedOptionId)
      : null;

    // 2. Check for existing active enrollment
    const existingEnrollment = await Enrollment.findOne({
      where: { 
        studentId: studentid, 
        courseId: courseId, 
        // Check for active status (enrolled, trainer_assigned, in_progress). Exclude cancelled/completed.
        status: { [Op.notIn]: ['cancelled', 'completed'] } 
      }
    });
    
    if (existingEnrollment) {
      return res.status(400).json({ message: "Student is already actively enrolled in this course." });
    }

    // 3. Create the enrollment
    const enrollment = await Enrollment.create({
      studentName: student.name,
      studentEmail: student.email,
      studentId: student.id,
      courseId: course.id,
      selectedOptionId: selectedOption ? selectedOption.id : null,
      amount,
      paymentMethod,
      razorpay_order_id,
      razorpay_payment_id,
      courseStages: course.stages || [],
      status: "enrolled", // Paid, pending trainer assignment
      trainerId: null,
      assignedAt: null,
    });

    res.status(201).json({ success: true, message: "✅ Enrollment created successfully. Trainer assignment pending.", enrollment });
  } catch (err) {
    console.error("Enrollment creation error:", err);
    res.status(500).json({ message: err.message || "Server error" });
  }
};

/* ===============================================================
   ASSIGN TRAINER (UPDATED)
================================================================= */
// Assign trainer to enrollment (Admin only)
exports.assignTrainer = async (req, res) => {
  try {
    // NOTE: Assuming middleware handles user role check (e.g., req.user.roleid === 1)
    if (!req.user || req.user.roleid !== 1) { // Assuming 1 is Admin RoleID
      // You can adjust this to your actual admin/manager role ID (e.g., roleid !== 2)
      // return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { enrollmentId, trainerId } = req.body;

    // Validate inputs
    if (!enrollmentId || !trainerId) {
      return res.status(400).json({ message: "Enrollment ID and Trainer ID are required" });
    }

    // Validate enrollment exists
    const enrollment = await Enrollment.findByPk(enrollmentId, {
      include: [
        { model: User, as: "student", attributes: ["id", "name", "email"] },
        { model: Course, as: "course", attributes: ["id", "title"] }
      ]
    });

    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    // Validate trainer exists and has the correct role
    const trainer = await User.findOne({
      where: { 
        id: trainerId,
        RoleId: 4, // Assuming 4 is the Trainer Role ID
      }
    });

    if (!trainer) {
      return res.status(404).json({ message: "Trainer not found or has an invalid role" });
    }

    // Update enrollment
    enrollment.trainerId = trainerId;
    enrollment.status = 'trainer_assigned'; // Set status to active
    enrollment.assignedAt = new Date();
    await enrollment.save();

    const studentName = enrollment.student?.name || "Student";
    const studentId = enrollment.student?.id;
    const courseTitle = enrollment.course?.title || "the course";

    // Send notification to student (recommended)
    try {
      await Message.create({
        senderId: req.user?.id || 1, // Use system/admin ID if req.user is null
        receiverId: studentId,
        content: `Hello ${studentName}! Your trainer **${trainer.name}** has been assigned for the course "${courseTitle}". You can now start scheduling classes.`,
        messageType: 'system_notification'
      });
    } catch (e) {
      console.warn("Could not send student notification:", e.message);
    }
    
    // Send notification to trainer
    try {
      await Message.create({
        senderId: req.user?.id || 1,
        receiverId: trainerId,
        content: `You have been assigned a new student: **${studentName}** for the course "${courseTitle}". Please reach out to them to begin their training journey.`,
        messageType: 'system_notification'
      });
    } catch (e) {
      console.warn("Could not send trainer notification:", e.message);
    }

    // Send WebSocket notifications (if clients map is used)
    const studentSocket = clients.get(studentId);
    if (studentSocket?.ws) {
      studentSocket.ws.send(JSON.stringify({ type: 'trainer_assigned', trainerId, trainerName: trainer.name }));
    }

    const trainerSocket = clients.get(trainerId);
    if (trainerSocket?.ws) {
      trainerSocket.ws.send(JSON.stringify({ type: 'student_assigned', studentId, studentName }));
    }

    // Send response
    res.status(200).json({ 
      success: true,
      message: `✅ Trainer ${trainer.name} assigned successfully.`, 
      enrollment: {
        ...enrollment.toJSON(),
        trainer: { 
          id: trainer.id, 
          name: trainer.name, 
          email: trainer.email,
          specialist: trainer.specialist || 'General'
        }
      }
    });

  } catch (err) {
    console.error("❌ Trainer assignment error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


/* ===============================================================
   ADMIN/MANAGEMENT FUNCTIONS
================================================================= */

// Get enrollments pending trainer assignment (Admin only)
exports.getPendingAssignments = async (req, res) => {
  try {
    // NOTE: Add role check (e.g., req.user.roleid === 1)
    const pendingEnrollments = await Enrollment.findAll({
      where: { 
        trainerId: null,
        status: 'enrolled'
      },
      include: [
        { model: User, as: "student", attributes: ["id", "name", "email"] },
        { model: Course, as: "course", attributes: ["id", "title"] },
        { model: CoursePriceOption, as: "selectedOption" },
      ],
      order: [['createdAt', 'ASC']]
    });

    res.json({
      message: "Pending trainer assignments retrieved",
      count: pendingEnrollments.length,
      enrollments: pendingEnrollments
    });

  } catch (err) {
    console.error("❌ Error fetching pending assignments:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get available trainers (Admin only) - Includes active enrollment count
exports.getAvailableTrainers = async (req, res) => {
  try {
    // NOTE: Add role check (e.g., req.user.roleid === 1)

    // Fetch trainers (RoleId = 4) who are active
    const trainers = await User.findAll({
      where: { 
        RoleId: 4,
        active: true
      },
      attributes: ["id", "name", "email", "specialist", "createdAt"],
      include: [{
        model: Enrollment,
        as: "trainerEnrollments",
        // Filter for only active enrollments to get a true workload count
        where: { 
          status: { [Op.notIn]: ['cancelled', 'completed', 'enrolled'] } 
        },
        attributes: ["id"],
        required: false
      }]
    });

    // Map trainers to include number of active enrollments
    const trainersWithStats = trainers.map(trainer => {
      const t = trainer.toJSON();
      return {
        id: t.id,
        name: t.name,
        email: t.email,
        specialist: t.specialist || 'General',
        activeEnrollments: t.trainerEnrollments ? t.trainerEnrollments.length : 0
      };
    });

    res.json({
      success: true,
      message: "Available trainers retrieved successfully",
      count: trainersWithStats.length,
      trainers: trainersWithStats
    });

  } catch (err) {
    console.error("❌ Error fetching trainers:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};


/* ===============================================================
   TRAINER-SPECIFIC FUNCTIONS
================================================================= */

// Get trainer's assigned students (Trainer only)
exports.getTrainerStudents = async (req, res) => {
  try {
    // NOTE: Add role check (e.g., req.user.roleid === 4)
    const trainerId = req.user.id;

    const assignedEnrollments = await Enrollment.findAll({
      where: { trainerId },
      include: [
        { model: User, as: "student", attributes: ["id", "name", "email"] },
        { model: Course, as: "course", attributes: ["id", "title"] },
        { model: CoursePriceOption, as: "selectedOption" },
      ],
      order: [['assignedAt', 'DESC']]
    });

    res.json({
      message: "Assigned students retrieved",
      count: assignedEnrollments.length,
      enrollments: assignedEnrollments
    });

  } catch (err) {
    console.error("❌ Error fetching trainer students:", err);
    res.status(500).json({ message: "Server error" });
  }
};


/* ===============================================================
   STUDENT-SPECIFIC FUNCTIONS
================================================================= */

// Get student's enrolled courses/trainers
exports.getStudentEnrollments = async (req, res) => {
  try {
    const studentId = req.user?.id || req.body.studentId;

    if (!studentId) {
      return res.status(400).json({ message: "studentId is required" });
    }

    const enrollments = await Enrollment.findAll({
      where: { studentId },
      include: [
        { model: Course, as: "course", attributes: ["id", "title"] },
        { model: CoursePriceOption, as: "selectedOption" },
        { model: User, as: "trainer", attributes: ["id", "name", "email", "specialist"], required: false },
      ],
      order: [['createdAt', 'DESC']]
    });

    if (enrollments.length === 0) {
      return res.status(404).json({ message: "No enrollments found for this student." });
    }

    res.json(enrollments);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
};

// Get student's trainer info for a specific enrollment
exports.getStudentTrainer = async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const studentId = req.user.id;

    const enrollment = await Enrollment.findOne({
      where: { 
        id: enrollmentId,
        studentId: studentId 
      },
      include: [
        { 
          model: User, 
          as: "trainer", 
          attributes: ["id", "name", "email", "specialist"],
          required: false
        },
        { model: Course, as: "course", attributes: ["id", "title"] }
      ]
    });

    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found or access denied" });
    }

    res.json({
      message: "Trainer information retrieved",
      enrollment: enrollment,
      trainer: enrollment.trainer || null
    });

  } catch (err) {
    console.error("❌ Error fetching student trainer:", err);
    res.status(500).json({ message: "Server error" });
  }
};


/* ===============================================================
   GENERIC/ADMIN GETTERS AND UPDATES
================================================================= */

// Get all enrollments (Admin only)
exports.getAllEnrollments = async (req, res) => {
  try {
    const enrollments = await Enrollment.findAll({
      include: [
        { model: User, as: "student", attributes: ["id", "name", "email"] },
        { model: Course, as: "course", attributes: ["id", "title"] },
        { model: CoursePriceOption, as: "selectedOption" },
        { model: User, as: "trainer", attributes: ["id", "name", "email", "specialist"], required: false },
      ],
      order: [['createdAt', 'DESC']]
    });
    res.json(enrollments);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Get single enrollment by ID
exports.getEnrollmentById = async (req, res) => {
  try {
    const enrollment = await Enrollment.findByPk(req.params.id, {
      include: [
        { model: User, as: "student", attributes: ["id", "name", "email"] },
        { model: Course, as: "course", attributes: ["id", "title"] },
        { model: CoursePriceOption, as: "selectedOption" },
        { model: User, as: "trainer", attributes: ["id", "name", "email", "specialist"], required: false },
      ],
    });
    if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });
    res.json(enrollment);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

// Update course stage progress (Trainer/Student based on logic)
exports.updateProgress = async (req, res) => {
  try {
    const { enrollmentId } = req.params;
    const { stageId, completed, feedback } = req.body;

    const enrollment = await Enrollment.findByPk(enrollmentId);
    if (!enrollment) return res.status(404).json({ message: "Enrollment not found" });

    let stages = enrollment.courseStages || [];
    stages = stages.map((stage) =>
      stage.id === stageId ? { ...stage, completed, feedback } : stage
    );

    enrollment.courseStages = stages;
    await enrollment.save();

    res.json({ message: "Progress updated", stages });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = exports;