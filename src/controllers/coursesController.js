const { Op } = require("sequelize");
const { google } = require("googleapis");
const path = require("path");
const fs = require("fs");
const moment = require("moment");

const User = require("../models/userModel");
const Class = require("../models/class");
const Course = require("../models/course");
const Enrollment = require("../models/enrollment");
const Message = require("../models/messageModel");
const CoursePriceOption = require("../models/courseOptionModel");
const ClassSchedule = require("../models/classSchedule");
const { createGoogleMeet } = require("./utils");

const checkAndUpdateEnrollmentStatus = async (studentId, courseId, trainerId) => {
  try {
  
    const course = await Course.findByPk(courseId);
    if (!course) return;

 
    const scheduledCount = await ClassSchedule.count({
      where: {
        studentId,
        courseId,
        trainerId,
        status: { [Op.not]: 'cancelled' }
      }
    });

    // Count completed classes
    const completedCount = await ClassSchedule.count({
      where: {
        studentId,
        courseId,
        trainerId,
        status: 'completed'
      }
    });

  
    const remainingClasses = Math.max(0, course.totalClasses - scheduledCount);


    const enrollment = await Enrollment.findOne({
      where: { studentId, courseId, trainerId }
    });

    if (!enrollment) return;

    console.log(`📊 Progress Check:
        - Total Classes: ${course.totalClasses}
        - Scheduled: ${scheduledCount}
        - Completed: ${completedCount}
        - Remaining: ${remainingClasses}
        `);

    // 🎯 KEY LOGIC: When remaining = 0 AND all scheduled classes are completed
    if (remainingClasses === 0 && completedCount >= course.totalClasses) {
      await enrollment.update({
        status: 'completed',
        completedAt: new Date()
      });
      console.log(`✅ 🎉 Enrollment COMPLETED! Student ${studentId}, Course ${courseId}`);
      console.log(`   All ${course.totalClasses} classes finished! Remaining = 0`);
      return true;
    }

    return false;

  } catch (err) {
    console.error('Error checking enrollment status:', err);
    return false;
  }
};


exports.allocateClassToStudent = async (req, res) => {
  try {
    const {
      studentId,
      courseId,
      scheduledDate,
      scheduledTime,
      notes,
      classTitle,
      classDescription,
      classDuration
    } = req.body;

    const trainerId = req.user.id;

    const trainer = await User.findByPk(trainerId);
    const student = await User.findByPk(studentId);
    const course = await Course.findByPk(courseId);

    if (!trainer || !student || !course) {
      return res.status(404).json({ error: "Invalid data provided (trainer, student, or course not found)" });
    }

    // 1. Enrollment Check
    const enrollment = await Enrollment.findOne({
      where: { studentId, courseId, trainerId },
    });
    if (!enrollment) {
      return res.status(403).json({ error: "Student is not enrolled in this course with this trainer." });
    }


    // 2️⃣ Double Booking Check (for both trainer and student)

    const requestedTime = moment(scheduledTime, "HH:mm:ss");

    // Time window: 1 hour before and after
    const oneHourBefore = requestedTime.clone().subtract(1, "hour").format("HH:mm:ss");
    const oneHourAfter = requestedTime.clone().add(1, "hour").format("HH:mm:ss");

    const existingSchedule = await ClassSchedule.findOne({
      where: {
        scheduledDate,
        scheduledTime: {
          [Op.between]: [oneHourBefore, oneHourAfter],
        },
        [Op.or]: [
          { trainerId },
          { studentId },
        ],
        status: { [Op.not]: "cancelled" },
      },
    });

    if (existingSchedule) {
      return res.status(400).json({
        error: "❌ Either the trainer or the student already has a class within 1 hour of this time.",
      });
    }

    // 2. Allocation Limit Check
    const scheduledCount = await ClassSchedule.count({
      where: {
        studentId,
        courseId: course.id,
        status: { [Op.not]: 'cancelled' }
      }
    });

    if (scheduledCount >= course.totalClasses) {
      return res.status(400).json({
        error: `❌ Allocation limit reached. Student has ${scheduledCount} of ${course.totalClasses} classes scheduled/completed.`
      });
    }

    const classOrder = scheduledCount + 1;

    // 3. Dynamic Class Creation/Reuse
    let newClass = await Class.findOne({
      where: { CourseId: courseId, order: classOrder }
    });

    if (!newClass) {
      newClass = await Class.create({
        title: classTitle || `Class ${classOrder} - ${course.title}`,
        description: classDescription || `Scheduled Class ${classOrder}`,
        content: classDescription,
        order: classOrder,
        duration: parseInt(classDuration) || 60,
        CourseId: courseId,
        isDynamic: true,
      });
    } else {
      await newClass.update({
        title: classTitle || newClass.title,
        description: classDescription || newClass.description,
        content: classDescription || newClass.content,
        duration: parseInt(classDuration) || newClass.duration,
      });
    }

    // 4. Create Google Meet
    let meetData = null;
    try {
      meetData = await createGoogleMeet(trainer, student, newClass, scheduledDate, scheduledTime);
    } catch (err) {
      console.log("⚠️ Meet creation failed:", err.message);
    }

    // 5. Create Schedule
    const schedule = await ClassSchedule.create({
      trainerId,
      studentId,
      classId: newClass.id,
      courseId: course.id,
      scheduledDate,
      scheduledTime,
      notes,
      status: "scheduled",
      meetLink: meetData?.meetLink || null,
      googleEventId: meetData?.eventId || null,
    });

    res.status(201).json({
      message: meetData
        ? `✅ Class ${newClass.title} (Order ${classOrder}) allocated with Google Meet link`
        : `Class ${newClass.title} (Order ${classOrder}) allocated successfully (Meet link not generated)`,
      schedule,
      newClass,
      meetLink: meetData?.meetLink || null,
    });
  } catch (err) {
    console.error("Allocate error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* ===============================================================
   UPDATE SCHEDULE (MODIFIED TO AUTO-COMPLETE ENROLLMENT)
================================================================= */
exports.updateSchedule = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const { scheduledDate, scheduledTime, status, notes } = req.body;
    const userId = req.user?.id;

    const schedule = await ClassSchedule.findByPk(scheduleId);

    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    if (schedule.trainerId !== userId && schedule.studentId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    await schedule.update({
      scheduledDate: scheduledDate || schedule.scheduledDate,
      scheduledTime: scheduledTime || schedule.scheduledTime,
      status: status || schedule.status,
      notes: notes !== undefined ? notes : schedule.notes,
    });

    // 🔥 CHECK AND UPDATE ENROLLMENT STATUS IF CLASS IS COMPLETED
    if (status === 'completed') {
      await checkAndUpdateEnrollmentStatus(
        schedule.studentId,
        schedule.courseId,
        schedule.trainerId
      );
    }

    const updatedSchedule = await ClassSchedule.findByPk(scheduleId, {
      include: [
        { model: Class, as: "class" },
        { model: User, as: "student", attributes: ['id', 'name', 'email'] },
        { model: User, as: "trainer", attributes: ['id', 'name', 'email'] },
        { model: Course, as: "course", attributes: ['id', 'title'] },
      ]
    });

    res.json({
      schedule: updatedSchedule,
      message: "✅ Schedule updated successfully"
    });
  } catch (err) {
    console.error('Update schedule error:', err);
    res.status(500).json({ error: err.message || "Something went wrong" });
  }
};

/* ===============================================================
   BULK ALLOCATE CLASSES (UPDATED)
================================================================= */
exports.bulkAllocateClasses = async (req, res) => {
  try {
    const { allocations, trainerId } = req.body;

    if (!Array.isArray(allocations) || allocations.length === 0) {
      return res.status(400).json({
        error: "Invalid allocations data. Expected non-empty array."
      });
    }

    const trainer = await User.findByPk(trainerId);
    if (!trainer) {
      return res.status(404).json({ error: "Trainer not found" });
    }

    const results = {
      successful: [],
      failed: [],
      successCount: 0,
      failureCount: 0,
    };

    for (let i = 0; i < allocations.length; i++) {
      try {
        const allocation = allocations[i];
        const {
          studentId,
          courseId,
          classTitle,
          scheduledDate,
          scheduledTime,
          duration = 60,
          notes = '',
        } = allocation;

        if (!studentId || !courseId || !classTitle || !scheduledDate || !scheduledTime) {
          results.failed.push({
            row: i + 2,
            data: allocation,
            error: 'Missing required fields',
          });
          results.failureCount++;
          continue;
        }

        const student = await User.findByPk(studentId);
        const course = await Course.findByPk(courseId);

        if (!student || !course) {
          results.failed.push({
            row: i + 2,
            data: allocation,
            error: 'Student or course not found',
          });
          results.failureCount++;
          continue;
        }

        const enrollment = await Enrollment.findOne({
          where: { studentId, courseId, trainerId },
        });

        if (!enrollment) {
          results.failed.push({
            row: i + 2,
            data: allocation,
            error: 'Student not enrolled',
          });
          results.failureCount++;
          continue;
        }

        const scheduledCount = await ClassSchedule.count({
          where: {
            studentId,
            courseId,
            status: { [Op.not]: 'cancelled' },
          }
        });

        if (scheduledCount >= course.totalClasses) {
          results.failed.push({
            row: i + 2,
            data: allocation,
            error: `Allocation limit reached (${scheduledCount}/${course.totalClasses})`,
          });
          results.failureCount++;
          continue;
        }

        const classOrder = scheduledCount + 1;

        let classRecord = await Class.findOne({
          where: { CourseId: courseId, order: classOrder }
        });

        if (!classRecord) {
          classRecord = await Class.create({
            title: classTitle,
            description: notes,
            content: notes,
            order: classOrder,
            duration: parseInt(duration) || 60,
            CourseId: courseId,
            isDynamic: true,
          });
        } else {
          await classRecord.update({
            title: classTitle,
            description: notes,
            content: notes,
            duration: parseInt(duration) || 60,
          });
        }

        let meetData = null;
        try {
          meetData = await createGoogleMeet(
            trainer,
            student,
            classRecord,
            scheduledDate,
            scheduledTime
          );
        } catch (meetErr) {
          console.log(`⚠️ Meet creation failed for row ${i + 2}:`, meetErr.message);
        }

        const schedule = await ClassSchedule.create({
          trainerId,
          studentId,
          classId: classRecord.id,
          courseId,
          scheduledDate,
          scheduledTime,
          notes,
          status: 'scheduled',
          meetLink: meetData?.meetLink || null,
          googleEventId: meetData?.eventId || null,
        });

        results.successful.push({
          row: i + 2,
          studentId,
          classTitle,
          scheduledDate,
          scheduleId: schedule.id,
        });
        results.successCount++;

      } catch (itemError) {
        results.failed.push({
          row: i + 2,
          data: allocations[i],
          error: itemError.message,
        });
        results.failureCount++;
      }
    }

    const statusCode = results.successCount > 0 ? 200 : 400;
    const message = `Bulk allocation completed. ${results.successCount} successful, ${results.failureCount} failed.`;

    res.status(statusCode).json({
      message,
      ...results,
    });

  } catch (err) {
    console.error("Bulk allocate error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* ===============================================================
   GET STUDENT'S ENROLLED CLASSES (UPDATED WITH ENROLLMENT STATUS)
================================================================= */
exports.getStudentEnrolledClasses = async (req, res) => {
  try {
    const { studentId: paramStudentId } = req.params;
    const user = req.user;

    let studentId = null;
    let trainerId = null;

    // ✅ Determine role
    if (user.role === "trainer") {
      trainerId = user.id;
      studentId = paramStudentId; // Trainer must pass studentId in params
      if (!studentId) {
        return res.status(400).json({ error: "Student ID is required for trainers" });
      }
    } else if (user.role === "student") {
      studentId = user.id; // student uses their own ID
    } else {
      return res.status(403).json({ error: "Unauthorized role" });
    }

    // 🧠 Build query
    const where = { studentId };
    if (trainerId) where.trainerId = trainerId;

    const enrollments = await Enrollment.findAll({
      where,
      include: [
        {
          model: Course,
          as: "course",
          attributes: ["id", "title", "thumbnail", "totalClasses"],
        },
      ],
    });

    if (!enrollments || enrollments.length === 0) {
      return res.status(404).json({ error: "No enrollments found" });
    }

    const courseIds = enrollments.map((e) => e.courseId);

    const allClasses = await Class.findAll({
      where: { CourseId: { [Op.in]: courseIds } },
      order: [["order", "ASC"]],
    });

    const scheduledClasses = await ClassSchedule.findAll({
      where: trainerId ? { studentId, trainerId } : { studentId },
      attributes: ["classId", "status", "courseId"],
    });

    const scheduledMap = scheduledClasses.reduce((acc, s) => {
      acc[s.classId] = s.status;
      return acc;
    }, {});

    const coursesWithClasses = enrollments.map((enrollment) => {
      const courseData = enrollment.course.toJSON();

      const courseSchedules = scheduledClasses.filter(
        (s) => s.courseId === courseData.id
      );
      const scheduledCount = courseSchedules.filter(
        (s) => s.status !== "cancelled"
      ).length;
      const completedCount = courseSchedules.filter(
        (s) => s.status === "completed"
      ).length;

      courseData.totalClasses = courseData.totalClasses || 0;
      courseData.scheduledCount = scheduledCount;
      courseData.completedCount = completedCount;
      courseData.remainingClasses = Math.max(
        0,
        courseData.totalClasses - scheduledCount
      );

      // Enrollment info
      courseData.enrollmentStatus = enrollment.status;

      courseData.enrollmentCompletedAt = enrollment.completedAt;

      // 🔑 Calculate Expiry Date (30 days after enrollmentDate)
      const enrollmentDate = enrollment.enrollmentDate || enrollment.createdAt;
      const expiryDate = new Date(enrollmentDate);
      expiryDate.setDate(expiryDate.getDate() + 30);
      courseData.expiryDate = expiryDate;




      const courseClasses = allClasses
        .filter((cls) => cls.CourseId === courseData.id)
        .map((cls) => ({
          ...cls.toJSON(),
          isScheduled: !!scheduledMap[cls.id],
          isCompleted: scheduledMap[cls.id] === "completed",
          scheduleStatus: scheduledMap[cls.id] || "pending",
        }));

      courseData.classes = courseClasses;

      if (courseData.thumbnail) {
        courseData.thumbnailUrl = `${req.protocol}://${req.get(
          "host"
        )}/uploads/${courseData.thumbnail}`;
      }

      return courseData;
    });

    res.json({
      courses: coursesWithClasses,
      message: "Enrolled courses fetched successfully",
    });
  } catch (err) {
    console.error("Get student enrolled classes error:", err);
    res.status(500).json({ error: err.message || "Something went wrong" });
  }
};

/* ===============================================================
   CREATE COURSE 
================================================================= */
exports.createCourse = async (req, res) => {
  try {
    const { title, description, totalClasses } = req.body;
    const rawOptions = req.body.options;
    const courseThumbnail = req.files?.courseThumbnail?.[0]?.filename;

    if (!title || !totalClasses) {
      return res.status(400).json({ error: "Title and totalClasses are required." });
    }

    const finalTotalClasses = parseInt(totalClasses) || 0;
    if (finalTotalClasses <= 0) {
      return res.status(400).json({ error: "totalClasses must be a number greater than 0." });
    }

    const course = await Course.create({
      title,
      description,
      thumbnail: courseThumbnail || null,
      duration: 0,
      totalClasses: finalTotalClasses,
      rating: 0,
    });

    if (rawOptions && rawOptions !== "undefined") {
      const parsedOptions =
        typeof rawOptions === "string" ? JSON.parse(rawOptions) : rawOptions;
      const optionsList = parsedOptions.map(opt => ({
        ...opt,
        courseId: course.id,
      }));
      await CoursePriceOption.bulkCreate(optionsList);
    }

    const completeCourse = await Course.findByPk(course.id, {
      include: [
        { model: Enrollment, as: "courseEnrollments" },
        { model: User, as: "trainer", attributes: ["id", "name", "email"] },
        { model: CoursePriceOption, as: "priceOptions" },
      ],
    });

    res.status(201).json({
      course: completeCourse,
      message: `✅ Course created successfully with a limit of ${finalTotalClasses} classes.`,
    });
  } catch (err) {
    console.error("Create course error:", err);
    res.status(500).json({ error: err.message });
  }
};

/* ===============================================================
   GET ALL COURSES
================================================================= */
exports.getAllCourses = async (req, res) => {
  try {
    const courses = await Course.findAll({
      include: [
        { model: Enrollment, as: "courseEnrollments" },
        { model: User, as: "trainer", attributes: ['id', 'name', 'email', 'specialist'] },
        { model: CoursePriceOption, as: "priceOptions" }
      ],
      order: [['createdAt', 'DESC']],
    });

    const coursesWithUrls = courses.map(course => {
      const courseData = course.toJSON();
      if (courseData.thumbnail) courseData.thumbnailUrl = `${req.protocol}://${req.get('host')}/uploads/${courseData.thumbnail}`;
      return courseData;
    });

    res.json(coursesWithUrls);
  } catch (err) {
    console.error('Get all courses error:', err);
    res.status(500).json({ error: err.message });
  }
};

/* ===============================================================
   GET SINGLE COURSE
================================================================= */
exports.getCourse = async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id, {
      include: [
        { model: Class, as: "classes", order: [['order', 'ASC']] },
        { model: Enrollment, as: "courseEnrollments" },
        { model: User, as: "trainer", attributes: ['id', 'name', 'email'] },
        { model: CoursePriceOption, as: "priceOptions" },
      ],
    });

    if (!course) return res.status(404).json({ error: "Course not found" });

    const courseData = course.toJSON();
    if (courseData.thumbnail) courseData.thumbnailUrl = `${req.protocol}://${req.get('host')}/uploads/${courseData.thumbnail}`;

    if (courseData.classes) {
      courseData.classes = courseData.classes.map(cls => {
        if (cls.thumbnail) cls.thumbnailUrl = `${req.protocol}://${req.get('host')}/uploads/${cls.thumbnail}`;
        return cls;
      });
    }

    res.json(courseData);
  } catch (err) {
    console.error('Get course error:', err);
    res.status(500).json({ error: err.message });
  }
};

/* ===============================================================
   UPDATE COURSE 
================================================================= */
exports.updateCourse = async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    if (req.body.trainerId) {
      const trainer = await User.findOne({ where: { id: req.body.trainerId } });
      if (!trainer) return res.status(400).json({ error: "Invalid trainer ID" });
      req.body.trainerId = trainer.id;
    }

    const updatePayload = {
      title: req.body.title,
      description: req.body.description,
      TrainerId: req.body.trainerId ?? course.TrainerId,
      rating: course.rating || 0,
    };

    if (req.body.totalClasses !== undefined) {
      const newTotalClasses = parseInt(req.body.totalClasses);
      if (newTotalClasses > 0) {
        updatePayload.totalClasses = newTotalClasses;
      } else {
        return res.status(400).json({ error: "totalClasses must be a number greater than 0." });
      }
    }

    await course.update(updatePayload);

    if (req.body.options) {
      await CoursePriceOption.destroy({ where: { courseId: course.id } });
      const parsedOptions =
        typeof req.body.options === "string" ? JSON.parse(req.body.options) : req.body.options;
      const optionsList = parsedOptions.map(opt => ({
        ...opt,
        courseId: course.id,
      }));
      await CoursePriceOption.bulkCreate(optionsList);
    }

    const updatedCourse = await Course.findByPk(course.id, {
      include: [
        { model: Class, as: "classes" },
        { model: Enrollment, as: "courseEnrollments" },
        { model: User, as: "trainer", attributes: ['id', 'name', 'email'] },
        { model: CoursePriceOption, as: "priceOptions" },
      ]
    });

    res.json({ course: updatedCourse, message: "✅ Course updated successfully" });
  } catch (err) {
    console.error('Update course error:', err);
    res.status(500).json({ error: err.message });
  }
};

/* ===============================================================
   DELETE COURSE
================================================================= */
exports.deleteCourse = async (req, res) => {
  try {
    const course = await Course.findByPk(req.params.id);
    if (!course) return res.status(404).json({ error: "Course not found" });

    await course.destroy();
    res.json({ message: "✅ Course deleted successfully" });
  } catch (err) {
    console.error('Delete course error:', err);
    res.status(500).json({ error: err.message });
  }
};

/* ===============================================================
   ENROLL STUDENT
================================================================= */
exports.enrollStudent = async (req, res) => {
  try {
    const { studentName, studentId, trainerId } = req.body;
    const courseId = req.params.id;

    if (!studentName || !studentId || !trainerId)
      return res.status(400).json({ error: "Student name, Student ID, and Trainer ID are required" });

    const course = await Course.findByPk(courseId);
    const trainer = await User.findByPk(trainerId);

    if (!course) return res.status(404).json({ error: "Course not found" });
    if (!trainer) return res.status(404).json({ error: "Trainer not found" });

    const existingEnrollment = await Enrollment.findOne({
      where: { studentId, courseId, trainerId }
    });

    if (existingEnrollment) return res.status(400).json({ error: "Student is already enrolled" });

    const enrollment = await Enrollment.create({
      studentName: studentName.trim(),
      studentId,
      courseId,
      trainerId,
      status: 'trainer_assigned'
    });

    res.status(201).json({ enrollment, message: "✅ Student enrolled successfully" });
  } catch (err) {
    console.error('Enroll student error:', err);
    res.status(500).json({ error: err.message });
  }
};

/* ===============================================================
   GET ACTIVE COURSES FOR STUDENT
================================================================= */
exports.getActiveCoursesForStudent = async (req, res) => {
  try {
    const studentId = req.user?.id || req.body.studentId;
    if (!studentId) return res.status(400).json({ error: "Student ID is required" });

    const enrolledCourses = await Course.findAll({
      include: [
        { model: Enrollment, as: "courseEnrollments", where: { studentId }, required: true },
        { model: User, as: "trainer", attributes: ['id', 'name', 'email'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    const scheduledClasses = await ClassSchedule.findAll({
      where: { studentId },
      attributes: ['courseId', 'status']
    });

    const coursesWithUrls = enrolledCourses.map(course => {
      const courseData = course.toJSON();

      const courseSchedules = scheduledClasses.filter(s => s.courseId === courseData.id);
      courseData.scheduledCount = courseSchedules.filter(s => s.status !== 'cancelled').length;
      courseData.completedCount = courseSchedules.filter(s => s.status === 'completed').length;
      courseData.remainingClasses = Math.max(0, courseData.totalClasses - courseData.scheduledCount);

      // 🔥 ADD ENROLLMENT STATUS
      const enrollment = courseData.courseEnrollments?.[0];
      courseData.enrollmentStatus = enrollment?.status || 'active';
      courseData.enrollmentCompletedAt = enrollment?.completedAt;

      if (courseData.thumbnail) courseData.thumbnailUrl = `${req.protocol}://${req.get('host')}/uploads/${courseData.thumbnail}`;
      return courseData;
    });

    res.json(coursesWithUrls);
  } catch (err) {
    console.error('Get active courses for student error:', err);
    res.status(500).json({ error: err.message });
  }
};

/* ===============================================================
   REMAINING FUNCTIONS (UNCHANGED)
================================================================= */
exports.getTrainersForStudentCourses = async (req, res) => {
  try {
    const studentId = req.user?.id || req.query.studentId || req.body.studentId;
    if (!studentId) return res.status(400).json({ error: "Student ID is required" });

    const enrollments = await Enrollment.findAll({
      where: { studentId },
      attributes: ['trainerId'],
      group: ['trainerId'],
    });

    const trainerIds = enrollments.map(e => e.trainerId).filter(id => id !== null);

    const trainers = await User.findAll({
      where: { id: { [Op.in]: trainerIds } },
      attributes: ["id", "name", "email", "specialist"],
    });

    const enrichedTrainers = await Promise.all(
      trainers.map(async trainer => {
        const lastMsg = await Message.findOne({
          where: {
            [Op.or]: [
              { senderId: trainer.id, receiverId: studentId },
              { senderId: studentId, receiverId: trainer.id },
            ],
          },
          order: [["createdAt", "DESC"]],
        });

        const unreadCount = await Message.count({
          where: { senderId: trainer.id, receiverId: studentId, read: false },
        });

        return {
          ...trainer.toJSON(),
          lastMessage: lastMsg?.content || "No messages yet",
          lastSeen: lastMsg?.createdAt || null,
          unreadCount,
        };
      })
    );

    res.json({ trainers: enrichedTrainers });
  } catch (err) {
    console.error("Get trainers error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getStudentsForTrainer = async (req, res) => {
  try {
    const trainerId = req.user?.id || req.query.trainerId || req.body.trainerId;
    if (!trainerId) return res.status(400).json({ error: "Trainer ID is required" });

    const enrollments = await Enrollment.findAll({
      where: { trainerId },
      include: [
        {
          model: User,
          as: "student",
          attributes: ["id", "name", "email", "specialist"]
        },
        {
          model: Course,
          as: "course",
          attributes: ["id", "title", "thumbnail", "totalClasses"],
          include: [
            {
              model: Class,
              as: "classes",
              order: [['order', 'ASC']]
            },
            {
              model: CoursePriceOption,
              as: "priceOptions"
            }
          ]
        }
      ],
      order: [['createdAt', 'DESC']]
    });

    const studentMap = new Map();

    for (const enrollment of enrollments) {
      const student = enrollment.student.toJSON();
      const course = enrollment.course.toJSON();

      const scheduledClasses = await ClassSchedule.findAll({
        where: { studentId: student.id, courseId: course.id },
        attributes: ['status', 'classId']
      });

      const scheduledCount = scheduledClasses.filter(s => s.status !== 'cancelled').length;
      const completedCount = scheduledClasses.filter(s => s.status === 'completed').length;
      const remainingClasses = Math.max(0, (course.totalClasses || 0) - scheduledCount);

      const classMap = scheduledClasses.reduce((acc, cls) => {
        acc[cls.classId] = cls.status;
        return acc;
      }, {});

      const classesWithStatus = course.classes.map(cls => ({
        ...cls,
        scheduleStatus: classMap[cls.id] || 'pending'
      }));

      const courseData = {
        id: course.id,
        title: course.title,
        thumbnail: course.thumbnail,
        thumbnailUrl: course.thumbnail ? `${req.protocol}://${req.get('host')}/uploads/${course.thumbnail}` : null,
        totalClasses: course.totalClasses,
        scheduledCount,
        completedCount,
        remainingClasses,
        classes: classesWithStatus,
        enrollmentDetails: {
          id: enrollment.id,
          studentName: student.name,
          studentEmail: student.email,
          studentId: student.id,
          courseId: course.id,
          selectedOptionId: enrollment.selectedOptionId,
          amount: enrollment.amount,
          status: enrollment.status,
          completedAt: enrollment.completedAt
        },
        priceOptions: course.priceOptions || []
      };

      if (!studentMap.has(student.id)) {
        studentMap.set(student.id, { ...student, courses: [courseData] });
      } else {
        const existing = studentMap.get(student.id);
        existing.courses.push(courseData);
      }
    }

    const enrichedStudents = await Promise.all(
      Array.from(studentMap.values()).map(async student => {
        const lastMsg = await Message.findOne({
          where: {
            [Op.or]: [
              { senderId: student.id, receiverId: trainerId },
              { senderId: trainerId, receiverId: student.id }
            ]
          },
          order: [['createdAt', 'DESC']]
        });

        const unreadCount = await Message.count({
          where: { senderId: student.id, receiverId: trainerId, read: false }
        });

        return {
          ...student,
          lastMessage: lastMsg?.content || "No messages yet",
          lastSeen: lastMsg?.createdAt || null,
          unreadCount
        };
      })
    );

    res.json({ students: enrichedStudents });
  } catch (err) {
    console.error("Get students error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getCourseOptions = async (req, res) => {
  try {
    const options = await CoursePriceOption.findAll();
    res.status(200).json(options);
  } catch (err) {
    console.error("Error fetching course options:", err);
    res.status(500).json({ message: "Failed to fetch course options" });
  }
};

exports.getStudentSchedules = async (req, res) => {
  try {
    const studentId = req.user?.id || req.params.studentId || req.query.studentId;

    if (!studentId) {
      return res.status(400).json({ error: "Student ID is required" });
    }

    const schedules = await ClassSchedule.findAll({
      where: { studentId },
      include: [
        { model: Class, as: "class" },
        { model: User, as: "trainer", attributes: ['id', 'name', 'email', 'specialist'] },
        { model: Course, as: "course", attributes: ['id', 'title', 'thumbnail', 'totalClasses'] },
      ],
      order: [['scheduledDate', 'ASC'], ['scheduledTime', 'ASC']],
    });

    const schedulesWithUrls = schedules.map(schedule => {
      const scheduleData = schedule.toJSON();
      if (scheduleData.course?.thumbnail) {
        scheduleData.course.thumbnailUrl = `${req.protocol}://${req.get('host')}/uploads/${scheduleData.course.thumbnail}`;
      }
      if (scheduleData.class?.thumbnail) {
        scheduleData.class.thumbnailUrl = `${req.protocol}://${req.get('host')}/uploads/${scheduleData.class.thumbnail}`;
      }
      return scheduleData;
    });

    res.json({ schedules: schedulesWithUrls });
  } catch (err) {
    console.error('Get student schedules error:', err);
    res.status(500).json({ error: err.message });
  }
};


exports.getreports = async (req, res) => {
  try {
    const trainerId = req.user?.id || req.params.trainerId || req.query.trainerId;

    if (!trainerId) {
      return res.status(400).json({ error: "Trainer ID is required" });
    }

    // Define last month's date range
    const startOfLastMonth = moment().subtract(0, "months").startOf("month").toDate();
    const endOfLastMonth = moment().subtract(0, "months").endOf("month").toDate();

    // Fetch all schedules for that trainer last month
    const schedules = await ClassSchedule.findAll({
      where: {
        trainerId,
        scheduledDate: {
          [Op.between]: [startOfLastMonth, endOfLastMonth],
        },
      },
      include: [
        { model: User, as: "student", attributes: ["id", "name", "email"] },
        { model: Course, as: "course", attributes: ["id", "title"] },
        { model: Class, as: "class", attributes: ["id", "title"] },
      ],
    });

    // Calculate stats
    const completedClasses = schedules.filter(s => s.status === "completed").length;
    const cancelledClasses = schedules.filter(s => s.status === "cancelled").length;

    const enrollments = await Enrollment.findAll({
      where: {
        trainerId,
        createdAt: { [Op.between]: [startOfLastMonth, endOfLastMonth] },
      },
      attributes: ["studentId"],
    });

    const uniqueStudentIds = new Set(enrollments.map(e => e.studentId));
    const totalStudentsHandled = uniqueStudentIds.size;

    // (Optional) Return sample recent classes (for dashboard preview)
    const recentClasses = schedules
      .filter(s => s.status === "completed")
      .sort((a, b) => new Date(b.scheduledDate) - new Date(a.scheduledDate))
      .slice(0, 5)
      .map(s => ({
        id: s.id,
        date: s.scheduledDate,
        time: s.scheduledTime,
        student: s.student?.name,
        course: s.course?.title,
        classTitle: s.class?.title,
        status: s.status,
      }));

    res.json({
      trainerId,
      month: moment(startOfLastMonth).format("MMMM YYYY"),
      stats: {
        totalCompleted: completedClasses,
        totalCancelled: cancelledClasses,
        totalStudentsHandled: totalStudentsHandled,
      },
      recentClasses,
    });
  } catch (err) {
    console.error("Trainer report error:", err);
    res.status(500).json({ error: err.message });
  }
};

exports.getTrainerSchedules = async (req, res) => {
  try {
    const trainerId = req.user?.id || req.params.trainerId || req.query.trainerId;

    if (!trainerId) {
      return res.status(400).json({ error: "Trainer ID is required" });
    }

    const schedules = await ClassSchedule.findAll({
      where: { trainerId },
      include: [
        { model: Class, as: "class" },
        { model: User, as: "student", attributes: ['id', 'name', 'email'] },
        { model: Course, as: "course", attributes: ['id', 'title', 'thumbnail'] },
      ],
      order: [['scheduledDate', 'ASC'], ['scheduledTime', 'ASC']],
    });

    const schedulesWithUrls = schedules.map(schedule => {
      const scheduleData = schedule.toJSON();
      if (scheduleData.course?.thumbnail) {
        scheduleData.course.thumbnailUrl = `${req.protocol}://${req.get('host')}/uploads/${scheduleData.course.thumbnail}`;
      }
      if (scheduleData.class?.thumbnail) {
        scheduleData.class.thumbnailUrl = `${req.protocol}://${req.get('host')}/uploads/${scheduleData.class.thumbnail}`;
      }
      return scheduleData;
    });

    res.json({ schedules: schedulesWithUrls });
  } catch (err) {
    console.error('Get trainer schedules error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.deleteSchedule = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const userId = req.user?.id;

    const schedule = await ClassSchedule.findByPk(scheduleId);

    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    if (schedule.trainerId !== userId) {
      return res.status(403).json({ error: "Only trainer can delete schedule" });
    }

    await schedule.destroy();

    res.json({ message: "✅ Schedule deleted successfully" });
  } catch (err) {
    console.error('Delete schedule error:', err);
    res.status(500).json({ error: err.message });
  }
};

exports.getScheduleById = async (req, res) => {
  try {
    const { scheduleId } = req.params;
    const userId = req.user?.id;

    const schedule = await ClassSchedule.findByPk(scheduleId, {
      include: [
        { model: Class, as: "class" },
        { model: User, as: "student", attributes: ['id', 'name', 'email'] },
        { model: User, as: "trainer", attributes: ['id', 'name', 'email', 'specialist'] },
        { model: Course, as: "course", attributes: ['id', 'title', 'thumbnail'] },
      ]
    });

    if (!schedule) {
      return res.status(404).json({ error: "Schedule not found" });
    }

    if (schedule.trainerId !== userId && schedule.studentId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    const scheduleData = schedule.toJSON();
    if (scheduleData.course?.thumbnail) {
      scheduleData.course.thumbnailUrl = `${req.protocol}://${req.get('host')}/uploads/${scheduleData.course.thumbnail}`;
    }
    if (scheduleData.class?.thumbnail) {
      scheduleData.class.thumbnailUrl = `${req.protocol}://${req.get('host')}/uploads/${scheduleData.class.thumbnail}`;
    }

    res.json({ schedule: scheduleData });
  } catch (err) {
    console.error('Get schedule by ID error:', err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = exports;