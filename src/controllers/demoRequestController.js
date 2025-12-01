const DemoRequest = require("../models/demoRequest");
const TrainerAvailability = require("../models/trainerAvailability");
const DemoSession = require("../models/demoSession");
const Course = require("../models/course");
const User = require("../models/userModel");
const { Op } = require("sequelize");

// Create demo request by student
exports.createDemoRequest = async (req, res) => {
  try {
    const {
      studentName,
      studentId,
      courseId,
      requestMessage,
      preferredDateTime
    } = req.body;

    // Validation
    if (!studentName || !studentId || !courseId) {
      return res.status(400).json({ 
        error: "Student name, student ID, and course ID are required" 
      });
    }

    // Check if course exists
    const course = await Course.findByPk(courseId);
    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    // Check if student exists
    const student = await User.findByPk(studentId);
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Check for existing pending request
    const existingRequest = await DemoRequest.findOne({
      where: {
        studentId,
        courseId,
        status: 'pending'
      }
    });

    if (existingRequest) {
      return res.status(400).json({ 
        error: "You already have a pending demo request for this course" 
      });
    }

    const demoRequest = await DemoRequest.create({
      studentName,
      studentId,
      courseId,
      requestMessage,
      preferredDateTime,
      status: 'pending'
    });

    const requestWithDetails = await DemoRequest.findByPk(demoRequest.id, {
      include: [
        { model: User, as: 'Student', attributes: ['id', 'name', 'email'] },
        { model: Course, attributes: ['id', 'title', 'description'] }
      ]
    });

    res.status(201).json({
      demoRequest: requestWithDetails,
      message: "Demo request submitted successfully. Awaiting admin approval."
    });

  } catch (error) {
    console.error('Create demo request error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get all demo requests (for admin)
exports.getAllDemoRequests = async (req, res) => {
  try {
    const { status } = req.query;
    
    const whereClause = status ? { status } : {};

    const demoRequests = await DemoRequest.findAll({
      where: whereClause,
      include: [
        { model: User, as: 'Student', attributes: ['id', 'name', 'email'] },
        { model: Course, attributes: ['id', 'title', 'description'] },
        { model: User, as: 'AssignedTrainer', attributes: ['id', 'name', 'email', 'specialist'] },
        { model: User, as: 'ApprovedByAdmin', attributes: ['id', 'name', 'email'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      demoRequests,
      message: "Demo requests fetched successfully"
    });

  } catch (error) {
    console.error('Get all demo requests error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Approve demo request and assign trainer (admin only)
exports.approveDemoRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { assignedTrainerId, scheduledDateTime, approvedBy } = req.body;

    if (!assignedTrainerId || !scheduledDateTime || !approvedBy) {
      return res.status(400).json({ 
        error: "Assigned trainer ID, scheduled date time, and approver ID are required" 
      });
    }

    const demoRequest = await DemoRequest.findByPk(id);
    if (!demoRequest) {
      return res.status(404).json({ error: "Demo request not found" });
    }

    if (demoRequest.status !== "pending") {
      return res.status(400).json({ 
        error: "Only pending requests can be approved" 
      });
    }

    // ✅ Check approver exists
    const approver = await User.findByPk(approvedBy);
    if (!approver) {
      return res.status(400).json({ error: "Invalid approver ID" });
    }

    // Check trainer exists and is available
    const trainer = await User.findOne({
      where: { id: assignedTrainerId, RoleId: 4 } 
    });

    if (!trainer) {
      return res.status(400).json({ error: "Invalid trainer ID" });
    }

    // Check trainer availability
    const scheduledDate = new Date(scheduledDateTime);
    const dayOfWeek = scheduledDate.toLocaleString("en-US", { weekday: "long" }).toLowerCase();
    const scheduledTime = scheduledDate.toTimeString().slice(0, 5);

    const trainerAvailability = await TrainerAvailability.findOne({
      where: {
        trainerId: assignedTrainerId,
        dayOfWeek,
        startTime: { [Op.lte]: scheduledTime },
        endTime: { [Op.gte]: scheduledTime },
        isAvailable: true,
      },
    });

    if (!trainerAvailability) {
      return res.status(400).json({ 
        error: "Trainer is not available at the requested time" 
      });
    }

    // ✅ Update demo request
    await demoRequest.update({
      status: "approved",
      assignedTrainerId,
      approvedBy,
      approvedAt: new Date(),
      scheduledDateTime,
    });

    const updatedRequest = await DemoRequest.findByPk(id, {
      include: [
        { model: User, as: "Student", attributes: ["id", "name", "email"] },
        { model: Course, attributes: ["id", "title", "description"] },
        { model: User, as: "AssignedTrainer", attributes: ["id", "name", "email", "specialist"] },
        { model: User, as: "ApprovedByAdmin", attributes: ["id", "name", "email"] },
      ],
    });

    res.json({
      demoRequest: updatedRequest,
      message: "Demo request approved and trainer assigned successfully",
    });

  } catch (error) {
    console.error("Approve demo request error:", error);
    res.status(500).json({ error: error.message });
  }
};


// Reject demo request (admin only)
exports.rejectDemoRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejectionReason, rejectedBy } = req.body;

    if (!rejectionReason) {
      return res.status(400).json({ error: "Rejection reason is required" });
    }

    const demoRequest = await DemoRequest.findByPk(id);
    if (!demoRequest) {
      return res.status(404).json({ error: "Demo request not found" });
    }

    if (demoRequest.status !== 'pending') {
      return res.status(400).json({ 
        error: "Only pending requests can be rejected" 
      });
    }

    await demoRequest.update({
      status: 'rejected',
      rejectionReason,
      approvedBy: rejectedBy,
      approvedAt: new Date()
    });

    const updatedRequest = await DemoRequest.findByPk(id, {
      include: [
        { model: User, as: 'Student', attributes: ['id', 'name', 'email'] },
        { model: Course, attributes: ['id', 'title', 'description'] },
        { model: User, as: 'ApprovedByAdmin', attributes: ['id', 'name', 'email'] }
      ]
    });

    res.json({
      demoRequest: updatedRequest,
      message: "Demo request rejected successfully"
    });

  } catch (error) {
    console.error('Reject demo request error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get demo requests by student
exports.getStudentDemoRequests = async (req, res) => {
  try {
    const studentId = req.user?.id || req.params.studentId;

    if (!studentId) {
      return res.status(400).json({ error: "Student ID is required" });
    }

    const demoRequests = await DemoRequest.findAll({
      where: { studentId },
      include: [
        { model: Course, attributes: ['id', 'title', 'description', 'thumbnail'] },
        { model: User, as: 'AssignedTrainer', attributes: ['id', 'name', 'email', 'specialist'] },
        { model: User, as: 'ApprovedByAdmin', attributes: ['id', 'name', 'email'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    res.json({
      demoRequests,
      message: "Student demo requests fetched successfully"
    });

  } catch (error) {
    console.error('Get student demo requests error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get demo requests by trainer
exports.getTrainerDemoRequests = async (req, res) => {
  try {
    const trainerId = req.user?.id || req.params.trainerId;

    if (!trainerId) {
      return res.status(400).json({ error: "Trainer ID is required" });
    }

    const demoRequests = await DemoRequest.findAll({
      where: { 
        assignedTrainerId: trainerId,
        status: { [Op.in]: ['approved', 'completed'] }
      },
      include: [
        { model: User, as: 'Student', attributes: ['id', 'name', 'email'] },
        { model: Course, attributes: ['id', 'title', 'description'] }
      ],
      order: [['scheduledDateTime', 'ASC']]
    });

    res.json({
      demoRequests,
      message: "Trainer demo requests fetched successfully"
    });

  } catch (error) {
    console.error('Get trainer demo requests error:', error);
    res.status(500).json({ error: error.message });
  }
};