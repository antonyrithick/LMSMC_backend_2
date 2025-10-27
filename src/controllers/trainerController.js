const trainerService = require("../services/trainerService");
const TrainerAvailability = require("../models/trainerAvailability");
const DemoRequest = require("../models/demoRequest");
const User = require("../models/userModel");
const Course = require("../models/course"); // ✅ Ensure Course model is imported
const { sequelize, Op } = require("../models");

// ✅ Get all trainers
exports.getAllTrainers = async (req, res) => {
  try {
    const trainers = await trainerService.getAllTrainers();

    // Add availability info for each trainer
    const trainersWithAvailability = await Promise.all(
      trainers.map(async (trainer) => {
        const availability = await TrainerAvailability.findAll({
          where: { trainerId: trainer.id }, // ✅ FIXED
          order: [
            [
              sequelize.literal(`
                ARRAY_POSITION(
                  ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], "dayOfWeek"::text
                )
              `),
              'ASC'
            ]
          ]
        });

        const pendingDemos = await DemoRequest.count({
          where: {
            assignedTrainerId: trainer.id,
            status: "approved"
          }
        });

        return {
          ...trainer.toJSON(),
          availability,
          pendingDemoSessions: pendingDemos
        };
      })
    );

    res.status(200).json({
      trainers: trainersWithAvailability,
      message: "Trainers fetched successfully"
    });
  } catch (err) {
    console.error("Get all trainers error:", err);
    res.status(400).json({ error: err.message });
  }
};

// ✅ Get trainer by ID
exports.getTrainerById = async (req, res) => {
  try {
    const trainer = await trainerService.getTrainerById(req.params.id);

    // Add detailed availability and demo info
    const availability = await TrainerAvailability.findAll({
      where: { trainerId: req.params.id },
      order: [
        [
          sequelize.literal(`
            ARRAY_POSITION(
              ARRAY['monday','tuesday','wednesday','thursday','friday','saturday','sunday'], "dayOfWeek"::text
            )
          `),
          "ASC"
        ]
      ]
    });

    const demoRequests = await DemoRequest.findAll({
      where: { assignedTrainerId: req.params.id },
      include: [
        { model: User, as: "Student", attributes: ["id", "name", "email"] },
        { model: Course, attributes: ["id", "title"] }
      ],
      order: [["createdAt", "DESC"]]
    });

    res.status(200).json({
      trainer: {
        ...trainer.toJSON(),
        availability,
        demoRequests
      },
      message: "Trainer details fetched successfully"
    });
  } catch (err) {
    console.error("Get trainer by ID error:", err);
    res.status(400).json({ error: err.message });
  }
};

// ✅ Create trainer
exports.createTrainer = async (req, res) => {
  try {
    const trainer = await trainerService.createTrainer(req.body);
    res.status(201).json({
      trainer,
      message: "Trainer created successfully"
    });
  } catch (err) {
    console.error("Create trainer error:", err);
    res.status(400).json({ error: err.message });
  }
};

// ✅ Update trainer
exports.updateTrainer = async (req, res) => {
  try {
    const trainer = await trainerService.updateTrainer(req.params.id, req.body);
    res.status(200).json({
      trainer,
      message: "Trainer updated successfully"
    });
  } catch (err) {
    console.error("Update trainer error:", err);
    res.status(400).json({ error: err.message });
  }
};

// ✅ Delete trainer
exports.deleteTrainer = async (req, res) => {
  try {
    // Check if trainer has any pending or approved demo requests
    const pendingDemos = await DemoRequest.count({
      where: {
        assignedTrainerId: req.params.id,
        status: { [Op.in]: ["pending", "approved"] }
      }
    });

    if (pendingDemos > 0) {
      return res.status(400).json({
        error: "Cannot delete trainer with pending or approved demo sessions"
      });
    }

    // Delete trainer availability first
    await TrainerAvailability.destroy({
      where: { trainerId: req.params.id }
    });

    await trainerService.deleteTrainer(req.params.id);

    res.status(200).json({
      message: "Trainer and associated availability deleted successfully"
    });
  } catch (err) {
    console.error("Delete trainer error:", err);
    res.status(400).json({ error: err.message });
  }
};

// ✅ Set trainer working hours/availability
exports.setTrainerAvailability = async (req, res) => {
  try {
    const trainerId = req.params.id;
    const { availability } = req.body;

    if (!availability || !Array.isArray(availability)) {
      return res.status(400).json({
        error: "Availability array is required"
      });
    }

    // Verify trainer exists
    const trainer = await User.findOne({
      where: { id: trainerId, roleId: 4 }
    });

    if (!trainer) {
      return res.status(404).json({ error: "Trainer not found" });
    }

    // Delete existing availability
    await TrainerAvailability.destroy({
      where: { trainerId }
    });

    // Create new availability slots
    const availabilityData = availability.map((slot) => ({
      trainerId,
      dayOfWeek: slot.dayOfWeek.toLowerCase(),
      startTime: slot.startTime,
      endTime: slot.endTime,
      isAvailable: slot.isAvailable !== false,
      maxStudentsPerSlot: slot.maxStudentsPerSlot || 1
    }));

    const createdAvailability = await TrainerAvailability.bulkCreate(
      availabilityData
    );

    res.status(201).json({
      trainerId,
      availability: createdAvailability,
      message: "Trainer availability set successfully"
    });
  } catch (error) {
    console.error("Set trainer availability error:", error);
    res.status(500).json({ error: error.message });
  }
};
