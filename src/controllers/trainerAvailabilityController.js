const TrainerAvailability = require("../models/trainerAvailability");
const User = require("../models/userModel");
const DemoSession = require("../models/demoSession");
const { Op, Sequelize } = require("sequelize");

// Set trainer availability
exports.setTrainerAvailability = async (req, res) => {
  try {
    const { trainerId, availability } = req.body;

    if (!trainerId || !availability || !Array.isArray(availability)) {
      return res.status(400).json({ 
        error: "Trainer ID and availability array are required" 
      });
    }

    // Verify trainer exists
    const trainer = await User.findOne({
      where: { id: trainerId, RoleId: 4 }
    });

    if (!trainer) {
      return res.status(404).json({ error: "Trainer not found" });
    }

    // Delete existing availability for this trainer
    await TrainerAvailability.destroy({
      where: { trainerId }
    });

    // Create new availability slots
    const availabilityData = availability.map(slot => ({
      trainerId,
      dayOfWeek: slot.dayOfWeek.toLowerCase(),
      startTime: slot.startTime,
      endTime: slot.endTime,
      isAvailable: slot.isAvailable !== false,
      maxStudentsPerSlot: slot.maxStudentsPerSlot || 1
    }));

    const createdAvailability = await TrainerAvailability.bulkCreate(availabilityData);

    res.status(201).json({
      availability: createdAvailability,
      message: "Trainer availability set successfully"
    });

  } catch (error) {
    console.error('Set trainer availability error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get trainer availability
exports.getTrainerAvailability = async (req, res) => {
  try {
    const { trainerId } = req.params;

    const availability = await TrainerAvailability.findAll({
      where: { trainerId },
      include: [
        {
          model: User,
          as: 'Trainer',
          attributes: ['id', 'name', 'email', 'specialist'],
        },
      ],
      order: [
        [
          Sequelize.literal(`
            CASE
              WHEN "dayOfWeek" = 'monday' THEN 1
              WHEN "dayOfWeek" = 'tuesday' THEN 2
              WHEN "dayOfWeek" = 'wednesday' THEN 3
              WHEN "dayOfWeek" = 'thursday' THEN 4
              WHEN "dayOfWeek" = 'friday' THEN 5
              WHEN "dayOfWeek" = 'saturday' THEN 6
              WHEN "dayOfWeek" = 'sunday' THEN 7
              ELSE 8
            END
          `),
          'ASC',
        ],
      ],
    });

    res.json({
      availability,
      message: 'Trainer availability fetched successfully',
    });

  } catch (error) {
    console.error('Get trainer availability error:', error);
    res.status(500).json({ error: error.message });
  }
};

// Get all available trainers for a specific time slot
// Get all available trainers OR trainers for a specific time slot
exports.getAvailableTrainers = async (req, res) => {
  try {
    const { dateTime } = req.query;

    let whereClause = { isAvailable: true };

    let requestedDate = null;
    let requestedTime = null;

    if (dateTime) {
      requestedDate = new Date(dateTime);
      if (isNaN(requestedDate)) {
        return res.status(400).json({ error: "Invalid DateTime format" });
      }

      const dayOfWeek = requestedDate
        .toLocaleString("en-US", { weekday: "long" })
        .toLowerCase();

      requestedTime = requestedDate.toTimeString().slice(0, 5); // "HH:MM"

      // Apply filters only if dateTime provided
      whereClause = {
        ...whereClause,
        dayOfWeek,
        startTime: { [Op.lte]: requestedTime },
        endTime: { [Op.gte]: requestedTime },
      };
    }

    const availableTrainers = await TrainerAvailability.findAll({
      where: whereClause,
      include: [
        {
          model: User,
          as: "Trainer",
          attributes: ["id", "name", "email", "specialist"],
        },
      ],
    });

    // If dateTime provided → also check existing sessions
    let trainersWithAvailability = availableTrainers;

    if (dateTime) {
      trainersWithAvailability = await Promise.all(
        availableTrainers.map(async (availability) => {
          const existingSessions = await DemoSession.count({
            where: {
              trainerId: availability.trainerId,
              scheduledDateTime: {
                [Op.between]: [
                  new Date(requestedDate.getTime() - 30 * 60 * 1000),
                  new Date(requestedDate.getTime() + 30 * 60 * 1000),
                ],
              },
              status: { [Op.in]: ["scheduled", "in_progress"] },
            },
          });

          return {
            ...availability.toJSON(),
            availableSlots: availability.maxStudentsPerSlot - existingSessions,
          };
        })
      );

      trainersWithAvailability = trainersWithAvailability.filter(
        (trainer) => trainer.availableSlots > 0
      );
    }

    res.json({
      availableTrainers: trainersWithAvailability,
      message: dateTime
        ? "Available trainers for the given time slot fetched successfully"
        : "All available trainers fetched successfully",
    });
  } catch (error) {
    console.error("Get available trainers error:", error);
    res.status(500).json({ error: error.message });
  }
};


// Update trainer availability
exports.updateTrainerAvailability = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const availability = await TrainerAvailability.findByPk(id);
    if (!availability) {
      return res.status(404).json({ error: "Availability slot not found" });
    }

    await availability.update(updateData);

    const updatedAvailability = await TrainerAvailability.findByPk(id, {
      include: [
        { model: User, as: 'Trainer', attributes: ['id', 'name', 'email', 'specialist'] }
      ]
    });

    res.json({
      availability: updatedAvailability,
      message: "Trainer availability updated successfully"
    });

  } catch (error) {
    console.error('Update trainer availability error:', error);
    res.status(500).json({ error: error.message });
  }
};