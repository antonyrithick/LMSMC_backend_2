const Enrollment = require("../models/enrollment");
const User = require("../models/userModel");
const Course = require("../models/course");
const CoursePriceOption = require("../models/courseOptionModel");
const Message = require("../models/messageModel");
const { Op } = require("sequelize");
const { clients } = require("../socket/socket");
const axios = require("axios");
const https = require("https");
const crypto = require("crypto");

const PAYAID_API_KEY = "2741d0d9-75a4-4fef-adea-626b2a9204c8";
const PAYAID_SALT = "7be167ac1b3ae6a3e4fdb54df6e9c483332fd64e";
const PAYAID_GETURL = "https://sandbox.payaid.com/v2/getpaymentrequesturl";
const PAYAID_STATUS_URL = "https://sandbox.payaid.com/v2/paymentstatus";
const PAYAID_MODE = "TEST";


function calculatePayaidHash(body) {
  const keys = Object.keys(body)
    .filter(k => body[k] !== undefined && body[k] !== null && String(body[k]).trim() !== "")
    .sort();

  let hashString = PAYAID_SALT;

  for (const key of keys) {
    hashString += "|" + String(body[key]).trim();
  }

  return crypto
    .createHash("sha512")
    .update(hashString, "utf8")
    .digest("hex")
    .toUpperCase();
}


exports.createOrder = async (req, res) => {
  try {
    const {
      amount,
      currency = "INR",
      order_id,
      name,
      email,
      phone,
      return_url,

      // EXTRA FIELDS FROM FRONTEND
      description = "",
      city = "",
      country = "",
      zip_code = "",

      udf1 = "",
      udf2 = "",
      udf3 = ""
    } = req.body;

    // Validate mandatory fields only
    if (!amount || !order_id || !name || !email || !return_url) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ------------ Payload for PayAid API (ONLY valid PayAid params) ------------
    const params = {
      api_key: PAYAID_API_KEY,
      order_id,
      amount: parseFloat(amount).toFixed(2),
      currency,
      description: description || `Payment for ${order_id}`,
      name,
      email,
      phone: phone || "",
      mode: PAYAID_MODE,
      return_url,
      udf1,       // studentId
      udf2,       // courseId
      udf3        // selectedOptionId
    };

    params.hash = calculatePayaidHash(params);

    const httpsAgent = new https.Agent({
      rejectUnauthorized: true,
      keepAlive: true,
      minVersion: "TLSv1.2",
      servername: "sandbox.payaid.com"
    });

    const resp = await axios.post(PAYAID_GETURL, params, {
      httpsAgent,
      headers: { "Content-Type": "application/json" }
    });

    return res.json({
      success: true,
      paymentUrl: resp.data.data.url,
      uuid: resp.data.data.uuid,

      // Return all fields back if needed
      receivedParams: {
        amount,
        currency,
        order_id,
        name,
        email,
        phone,
        city,
        country,
        zip_code,
        description,
        udf1,
        udf2,
        udf3
      }
    });

  } catch (err) {
    return res.status(500).json({
      message: "Order creation failed",
      error: err
    });
  }
};


exports.payaidCallback = async (req, res) => {
  try {
    const body = req.body;

    const receivedHash = body.hash;
    const temp = { ...body };
    delete temp.hash;

    const expectedHash = calculatePayaidHash(temp);

    if (receivedHash !== expectedHash) {
      return res.status(400).send("Hash mismatch");
    }

    // OPTIONAL: CONFIRM PAYMENT STATUS
    let confirm = false;
    try {
      const statusBody = {
        api_key: PAYAID_API_KEY,
        order_id: body.order_id,
        transaction_id: body.transaction_id
      };
      statusBody.hash = calculatePayaidHash(statusBody);

      const statusResp = await axios.post(PAYAID_STATUS_URL, statusBody);

      if (statusResp.data?.data?.[0]?.response_code === 0) {
        confirm = true;
      }
    } catch (e) {}

    // IF PAYMENT FAILED
    if (!confirm && body.response_code !== 0) {
      return res.status(200).send("Payment failed");
    }

    // -----------------------------
    // 🔥 CREATE ENROLLMENT HERE
    // -----------------------------
    const studentId = body.udf1;
    const courseId = body.udf2;
    const optionId = body.udf3;

    const student = await User.findByPk(studentId);
    const course = await Course.findByPk(courseId);
    const option = optionId ? await CoursePriceOption.findByPk(optionId) : null;

    if (!student || !course) return res.status(200).send("Invalid mapping");

    const exists = await Enrollment.findOne({
      where: {
        studentId,
        courseId,
        status: { [Op.notIn]: ["cancelled", "completed"] }
      }
    });

    if (exists) return res.status(200).send("Already enrolled");

    await Enrollment.create({
      studentName: student.name,
      studentEmail: student.email,
      studentId,
      courseId,
      selectedOptionId: option?.id || null,
      amount: parseFloat(body.amount),
      paymentMethod: "payaid",
      external_transaction_id: body.transaction_id,
      external_response: body,
      courseStages: course.stages || [],
      status: "enrolled"
    });

    return res.status(200).send("OK");

  } catch (err) {
    return res.status(500).send("Server error");
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






exports.getAllPayments = async (req, res) => {
  try {
    // Pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    // Fetch paginated enrollments with student info
    const { count, rows } = await Enrollment.findAndCountAll({
      attributes: ["amount", "enrollmentDate"], // Only required fields
      include: [
        {
          model: User,
          as: "student",
          attributes: ["name", "email"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit,
      offset,
    });

    // Calculate total amount (all enrollments)
    const totalAmountResult = await Enrollment.sum("amount");

    res.status(200).json({
      success: true,
      message: "Payments fetched successfully",
      pagination: {
        totalCount: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        limit,
      },
      totals: {
        totalAmount: totalAmountResult || 0,
      },
      data: rows,
    });
  } catch (error) {
    console.error("❌ Error fetching payments:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching payments",
      error: error.message,
    });
  }
};


module.exports = exports;