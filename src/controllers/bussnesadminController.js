const Enrollment = require("../models/enrollment");
const Course = require("../models/course");
const User = require("../models/userModel");
const { Op } = require("sequelize");

// Get all students report (all enrollments with student info)
const getAllStudentReports = async (req, res) => {
  try {
    // Fetch all enrollments with student, course, and trainer info
    const enrollments = await Enrollment.findAll({
      include: [
        {
          model: User,
          as: "student", // make sure Enrollment.belongsTo(User, { as: "student" })
          attributes: ["id", "name", "email", "createdAt"],
        },
        {
          model: Course,
          as: "course",
          attributes: ["id", "title", "duration"],
        },
        {
          model: User,
          as: "trainer", // make sure Enrollment.belongsTo(User, { as: "trainer" })
          attributes: ["id", "name", "email"],
          required: false,
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    // Summary statistics
    const totalEnrollments = enrollments.length;
    const assignedTrainers = enrollments.filter((e) => e.trainer).length;
    const pendingAssignments = totalEnrollments - assignedTrainers;

    const statusCounts = enrollments.reduce((acc, enrollment) => {
      acc[enrollment.status] = (acc[enrollment.status] || 0) + 1;
      return acc;
    }, {});

    // Count students handled per trainer
    const trainersMap = {};
    enrollments.forEach((e) => {
      if (e.trainer) {
        if (!trainersMap[e.trainer.id]) {
          trainersMap[e.trainer.id] = {
            id: e.trainer.id,
            name: e.trainer.name,
            email: e.trainer.email,
            studentsHandled: new Set(),
          };
        }
        trainersMap[e.trainer.id].studentsHandled.add(e.studentId);
      }
    });

    const trainers = Object.values(trainersMap).map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email,
      studentsHandled: t.studentsHandled.size,
    }));

    res.status(200).json({
      enrollments,
      summary: {
        totalEnrollments,
        assignedTrainers,
        pendingAssignments,
        statusBreakdown: statusCounts,
        trainers, // includes students handled per trainer
      },
    });
  } catch (error) {
    console.error("Error in getAllStudentReports:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get students report by course id
const getStudentsByCourse = async (req, res) => {
  try {
    const courseId = req.params.courseId;

    const enrollments = await Enrollment.findAll({
      where: { courseId: courseId }, // Fixed: should be courseId not CourseId
      include: [
        { 
          model: User, 
          as: "student", 
          attributes: ["id", "name", "email", "phone"] 
        },
        { 
          model: Course, 
          as: "course",
          attributes: ["id", "title", "duration", "level"] 
        },
        { 
          model: User, 
          as: "trainer", 
          attributes: ["id", "name", "email"], 
          required: false 
        }
      ],
      order: [["createdAt", "DESC"]]
    });

    if (!enrollments.length) {
      return res.status(404).json({ message: "No enrollments found for this course" });
    }

    // Course-specific statistics
    const courseStats = {
      totalStudents: enrollments.length,
      studentsWithTrainer: enrollments.filter(e => e.trainer).length,
      studentsWithoutTrainer: enrollments.filter(e => !e.trainer).length,
      statusBreakdown: enrollments.reduce((acc, enrollment) => {
        acc[enrollment.status] = (acc[enrollment.status] || 0) + 1;
        return acc;
      }, {})
    };

    res.status(200).json({
      course: enrollments[0]?.course,
      enrollments,
      statistics: courseStats
    });
  } catch (error) {
    console.error("Error in getStudentsByCourse:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get trainer assignment reports
const getTrainerAssignmentReports = async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.roleid !== 1) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    // Get all trainers with their assigned students
    const trainers = await User.findAll({
      where: { roleid: 3 }, // Trainer role
      attributes: ["id", "name", "email", "phone", "createdAt"],
      include: [
        {
          model: Enrollment,
          as: "trainerEnrollments",
          include: [
            { 
              model: User, 
              as: "student", 
              attributes: ["id", "name", "email"] 
            },
            { 
              model: Course, 
              as: "course", 
              attributes: ["id", "title"] 
            }
          ],
          required: false
        }
      ]
    });

    // Calculate trainer workload statistics
    const trainerStats = trainers.map(trainer => {
      const enrollments = trainer.trainerEnrollments || [];
      const activeEnrollments = enrollments.filter(e => 
        ['trainer_assigned', 'in_progress'].includes(e.status)
      );
      const completedEnrollments = enrollments.filter(e => e.status === 'completed');
      
      return {
        trainer: {
          id: trainer.id,
          name: trainer.name,
          email: trainer.email,
          phone: trainer.phone,
          joinedAt: trainer.createdAt
        },
        statistics: {
          totalAssigned: enrollments.length,
          activeStudents: activeEnrollments.length,
          completedStudents: completedEnrollments.length,
          workloadPercentage: Math.round((activeEnrollments.length / Math.max(enrollments.length, 1)) * 100)
        },
        students: enrollments.map(enrollment => ({
          studentId: enrollment.student.id,
          studentName: enrollment.student.name,
          studentEmail: enrollment.student.email,
          courseTitle: enrollment.course.title,
          status: enrollment.status,
          assignedAt: enrollment.assignedAt,
          amount: enrollment.amount
        }))
      };
    });

    // Overall statistics
    const totalTrainers = trainers.length;
    const activeTrainers = trainerStats.filter(t => t.statistics.activeStudents > 0).length;
    const totalAssignedStudents = trainerStats.reduce((sum, t) => sum + t.statistics.totalAssigned, 0);
    const averageStudentsPerTrainer = totalTrainers > 0 ? Math.round(totalAssignedStudents / totalTrainers) : 0;

    res.status(200).json({
      trainers: trainerStats,
      summary: {
        totalTrainers,
        activeTrainers,
        totalAssignedStudents,
        averageStudentsPerTrainer,
        inactiveTrainers: totalTrainers - activeTrainers
      }
    });

  } catch (error) {
    console.error("Error in getTrainerAssignmentReports:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get specific trainer's assignment report
const getTrainerAssignmentById = async (req, res) => {
  try {
    const { trainerId } = req.params;
    
    // Check if user is admin or the trainer themselves
    if (!req.user || (req.user.roleid !== 1 && req.user.id.toString() !== trainerId)) {
      return res.status(403).json({ message: "Access denied." });
    }

    const trainer = await User.findOne({
      where: { 
        id: trainerId,
        roleid: 3 
      },
      attributes: ["id", "name", "email", "phone", "createdAt"],
      include: [
        {
          model: Enrollment,
          as: "trainerEnrollments",
          include: [
            { 
              model: User, 
              as: "student", 
              attributes: ["id", "name", "email", "phone"] 
            },
            { 
              model: Course, 
              as: "course", 
              attributes: ["id", "title", "duration", "level"] 
            }
          ]
        }
      ]
    });

    if (!trainer) {
      return res.status(404).json({ message: "Trainer not found" });
    }

    const enrollments = trainer.trainerEnrollments || [];
    
    // Calculate detailed statistics
    const stats = {
      totalStudents: enrollments.length,
      activeStudents: enrollments.filter(e => ['trainer_assigned', 'in_progress'].includes(e.status)).length,
      completedStudents: enrollments.filter(e => e.status === 'completed').length,
      totalRevenue: enrollments.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0),
      averageProgress: enrollments.length > 0 ? 
        Math.round(enrollments.reduce((sum, e) => {
          const stages = e.courseStages || [];
          const completed = stages.filter(s => s.completed).length;
          return sum + (stages.length > 0 ? (completed / stages.length) * 100 : 0);
        }, 0) / enrollments.length) : 0
    };

    // Group students by course
    const courseGroups = enrollments.reduce((groups, enrollment) => {
      const courseId = enrollment.course.id;
      if (!groups[courseId]) {
        groups[courseId] = {
          course: enrollment.course,
          students: []
        };
      }
      groups[courseId].students.push({
        student: enrollment.student,
        enrollmentId: enrollment.id,
        status: enrollment.status,
        assignedAt: enrollment.assignedAt,
        amount: enrollment.amount,
        progress: enrollment.courseStages ? 
          Math.round((enrollment.courseStages.filter(s => s.completed).length / 
          Math.max(enrollment.courseStages.length, 1)) * 100) : 0
      });
      return groups;
    }, {});

    res.status(200).json({
      trainer: {
        id: trainer.id,
        name: trainer.name,
        email: trainer.email,
        phone: trainer.phone,
        joinedAt: trainer.createdAt
      },
      statistics: stats,
      courseGroups: Object.values(courseGroups),
      recentActivity: enrollments
        .sort((a, b) => new Date(b.assignedAt || b.createdAt) - new Date(a.assignedAt || a.createdAt))
        .slice(0, 5)
        .map(e => ({
          studentName: e.student.name,
          courseTitle: e.course.title,
          status: e.status,
          assignedAt: e.assignedAt
        }))
    });

  } catch (error) {
    console.error("Error in getTrainerAssignmentById:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get unassigned students report
const getUnassignedStudents = async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.roleid !== 1) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const unassignedEnrollments = await Enrollment.findAll({
      where: { 
        trainerId: null,
        status: 'enrolled'
      },
      include: [
        { 
          model: User, 
          as: "student", 
          attributes: ["id", "name", "email", "phone"] 
        },
        { 
          model: Course, 
          as: "course", 
          attributes: ["id", "title", "duration", "level"] 
        }
      ],
      order: [["createdAt", "ASC"]] // Oldest first for priority
    });

    // Group by course for better organization
    const courseGroups = unassignedEnrollments.reduce((groups, enrollment) => {
      const courseId = enrollment.course.id;
      if (!groups[courseId]) {
        groups[courseId] = {
          course: enrollment.course,
          students: [],
          count: 0
        };
      }
      groups[courseId].students.push({
        enrollmentId: enrollment.id,
        student: enrollment.student,
        enrolledAt: enrollment.createdAt,
        amount: enrollment.amount,
        daysPending: Math.floor((new Date() - new Date(enrollment.createdAt)) / (1000 * 60 * 60 * 24))
      });
      groups[courseId].count++;
      return groups;
    }, {});

    // Calculate urgency metrics
    const urgentAssignments = unassignedEnrollments.filter(e => {
      const daysPending = Math.floor((new Date() - new Date(e.createdAt)) / (1000 * 60 * 60 * 24));
      return daysPending > 2; // Consider urgent after 2 days
    });

    res.status(200).json({
      summary: {
        totalUnassigned: unassignedEnrollments.length,
        urgentAssignments: urgentAssignments.length,
        courseCount: Object.keys(courseGroups).length,
        oldestPendingDays: unassignedEnrollments.length > 0 ? 
          Math.floor((new Date() - new Date(unassignedEnrollments[0].createdAt)) / (1000 * 60 * 60 * 24)) : 0
      },
      courseGroups: Object.values(courseGroups),
      urgentStudents: urgentAssignments.map(e => ({
        enrollmentId: e.id,
        studentName: e.student.name,
        studentEmail: e.student.email,
        courseTitle: e.course.title,
        daysPending: Math.floor((new Date() - new Date(e.createdAt)) / (1000 * 60 * 60 * 24)),
        amount: e.amount
      }))
    });

  } catch (error) {
    console.error("Error in getUnassignedStudents:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get assignment timeline report
const getAssignmentTimeline = async (req, res) => {
  try {
    // Check if user is admin
    if (!req.user || req.user.roleid !== 1) {
      return res.status(403).json({ message: "Access denied. Admin only." });
    }

    const { days = 30 } = req.query; // Default to last 30 days
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const assignments = await Enrollment.findAll({
      where: {
        assignedAt: {
          [Op.gte]: startDate
        }
      },
      include: [
        { 
          model: User, 
          as: "student", 
          attributes: ["id", "name", "email"] 
        },
        { 
          model: User, 
          as: "trainer", 
          attributes: ["id", "name", "email"] 
        },
        { 
          model: Course, 
          as: "course", 
          attributes: ["id", "title"] 
        }
      ],
      order: [["assignedAt", "DESC"]]
    });

    // Group by date for timeline view
    const timelineData = assignments.reduce((timeline, assignment) => {
      const date = assignment.assignedAt.toISOString().split('T')[0];
      if (!timeline[date]) {
        timeline[date] = {
          date,
          assignments: [],
          count: 0
        };
      }
      timeline[date].assignments.push({
        enrollmentId: assignment.id,
        studentName: assignment.student.name,
        trainerName: assignment.trainer.name,
        courseTitle: assignment.course.title,
        assignedAt: assignment.assignedAt
      });
      timeline[date].count++;
      return timeline;
    }, {});

    res.status(200).json({
      summary: {
        totalAssignments: assignments.length,
        dateRange: {
          from: startDate.toISOString().split('T')[0],
          to: new Date().toISOString().split('T')[0]
        },
        averagePerDay: Math.round(assignments.length / parseInt(days))
      },
      timeline: Object.values(timelineData).sort((a, b) => new Date(b.date) - new Date(a.date))
    });

  } catch (error) {
    console.error("Error in getAssignmentTimeline:", error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = {
  getAllStudentReports,
  getStudentsByCourse,
  getTrainerAssignmentReports,
  getTrainerAssignmentById,
  getUnassignedStudents,
  getAssignmentTimeline
};