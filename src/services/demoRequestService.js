const DemoRequest = require("../models/demoRequest");
const TrainerAvailability = require("../models/trainerAvailability");
const DemoSession = require("../models/demoSession");
const Course = require("../models/course");
const User = require("../models/userModel");
const { Op } = require("sequelize");

class DemoRequestService {
  
  // Find best available trainer for a course and time
  async findBestTrainer(courseId, preferredDateTime) {
    try {
      const course = await Course.findByPk(courseId, {
        include: [{ model: User, as: 'Trainer' }]
      });

      if (!course || !course.Trainer) {
        // Find any available trainer if course has no assigned trainer
        return await this.findAnyAvailableTrainer(preferredDateTime);
      }

      // Check if course trainer is available
      const isAvailable = await this.checkTrainerAvailability(
        course.Trainer.id, 
        preferredDateTime
      );

      if (isAvailable) {
        return course.Trainer;
      } else {
        // Find alternative trainer
        return await this.findAnyAvailableTrainer(preferredDateTime);
      }

    } catch (error) {
      console.error('Find best trainer error:', error);
      throw error;
    }
  }

  async findAnyAvailableTrainer(preferredDateTime) {
    const requestedDate = new Date(preferredDateTime);
    const dayOfWeek = requestedDate.toLocaleDateString('en-US', { weekday: 'lowercase' });
    const requestedTime = requestedDate.toTimeString().slice(0, 5);

    const availableTrainers = await TrainerAvailability.findAll({
      where: {
        dayOfWeek,
        startTime: { [Op.lte]: requestedTime },
        endTime: { [Op.gte]: requestedTime },
        isAvailable: true
      },
      include: [
        { model: User, as: 'Trainer', attributes: ['id', 'name', 'email', 'specialist'] }
      ]
    });

    // Check actual availability (not overbooked)
    for (const availability of availableTrainers) {
      const existingSessions = await DemoSession.count({
        where: {
          trainerId: availability.trainerId,
          scheduledDateTime: {
            [Op.between]: [
              new Date(requestedDate.getTime() - 30 * 60 * 1000),
              new Date(requestedDate.getTime() + 30 * 60 * 1000)
            ]
          },
          status: { [Op.in]: ['scheduled', 'in_progress'] }
        }
      });

      if (existingSessions < availability.maxStudentsPerSlot) {
        return availability.Trainer;
      }
    }

    return null; // No trainer available
  }

  async checkTrainerAvailability(trainerId, dateTime) {
    const requestedDate = new Date(dateTime);
    const dayOfWeek = requestedDate.toLocaleDateString('en-US', { weekday: 'lowercase' });
    const requestedTime = requestedDate.toTimeString().slice(0, 5);

    const availability = await TrainerAvailability.findOne({
      where: {
        trainerId,
        dayOfWeek,
        startTime: { [Op.lte]: requestedTime },
        endTime: { [Op.gte]: requestedTime },
        isAvailable: true
      }
    });

    if (!availability) return false;

    // Check if trainer is not overbooked
    const existingSessions = await DemoSession.count({
      where: {
        trainerId,
        scheduledDateTime: {
          [Op.between]: [
            new Date(requestedDate.getTime() - 30 * 60 * 1000),
            new Date(requestedDate.getTime() + 30 * 60 * 1000)
          ]
        },
        status: { [Op.in]: ['scheduled', 'in_progress'] }
      }
    });

    return existingSessions < availability.maxStudentsPerSlot;
  }

  // Auto-assign trainer when admin approves
  async autoAssignTrainer(demoRequestId) {
    try {
      const demoRequest = await DemoRequest.findByPk(demoRequestId, {
        include: [{ model: Course }]
      });

      if (!demoRequest) {
        throw new Error("Demo request not found");
      }

      const bestTrainer = await this.findBestTrainer(
        demoRequest.courseId,
        demoRequest.preferredDateTime || new Date()
      );

      if (bestTrainer) {
        await demoRequest.update({
          assignedTrainerId: bestTrainer.id
        });
        return bestTrainer;
      }

      return null;
    } catch (error) {
      console.error('Auto assign trainer error:', error);
      throw error;
    }
  }
}

module.exports = new DemoRequestService();
