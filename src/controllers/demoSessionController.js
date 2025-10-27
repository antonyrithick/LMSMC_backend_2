const DemoSession = require("../models/demoSession");
const DemoRequest = require("../models/demoRequest");
const User = require("../models/userModel");
const Course = require("../models/course");

// Get all demo sessions
exports.getAllDemoSessions = async (req, res) => {
  try {
    const { status, trainerId, studentId } = req.query;
    
    let whereClause = {};
    if (status) whereClause.status = status;
    if (trainerId) whereClause.trainerId = trainerId;
    if (studentId) whereClause.studentId = studentId;

    const demoSessions = await DemoSession.findAll({
      where: whereClause,
      include: [
        {
          model: DemoRequest,
          include: [
            { model: Course, attributes: ['id', 'title', 'description'] }
          ]
        },
        { model: User, as: 'Trainer', attributes: ['id', 'name', 'email', 'specialist'] },
        { model: User, as: 'Student', attributes: ['id', 'name', 'email'] }
      ],
      order: [['scheduledDateTime', 'ASC']]
    });

    res.json({
      demoSessions,
      message: "Demo sessions fetched successfully"
    });

  } catch (error) {
    console.error('Get demo sessions error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Update demo session status
exports.updateDemoSession = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, sessionNotes, rating } = req.body;

    const demoSession = await DemoSession.findByPk(id);
    if (!demoSession) {
      return res.status(404).json({ error: "Demo session not found" });
    }

    const updateData = {};
    if (status) updateData.status = status;
    if (sessionNotes) updateData.sessionNotes = sessionNotes;
    if (rating) updateData.rating = rating;

    await demoSession.update(updateData);

    // If session is completed, update the related demo request
    if (status === 'completed') {
      await DemoRequest.update(
        { status: 'completed', demoNotes: sessionNotes },
        { where: { id: demoSession.demoRequestId } }
      );
    }

    const updatedSession = await DemoSession.findByPk(id, {
      include: [
        {
          model: DemoRequest,
          include: [
            { model: Course, attributes: ['id', 'title', 'description'] }
          ]
        },
        { model: User, as: 'Trainer', attributes: ['id', 'name', 'email', 'specialist'] },
        { model: User, as: 'Student', attributes: ['id', 'name', 'email'] }
      ]
    });

    res.json({
      demoSession: updatedSession,
      message: "Demo session updated successfully"
    });

  } catch (error) {
    console.error('Update demo session error:', error);
    res.status(500).json({ error: error.message });
  }
};