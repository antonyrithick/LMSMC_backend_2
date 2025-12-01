const Enrollment = require("../models/enrollment");
const CoursePriceOption = require("../models/courseOptionModel");

const createEnrollment = async ({
  studentName,
  studentid,
  studentEmail,
  courseId,
  selectedOptionId,
  amount,
  paymentMethod,
  razorpay_order_id,
  razorpay_payment_id,
  enrollmentDate,
}) => {
  // Validate option
  const option = await CoursePriceOption.findByPk(selectedOptionId);
  if (!option) {
    throw new Error("Invalid selectedOptionId");
  }

  // Create enrollment
  const enrollment = await Enrollment.create({
    studentName,
    studentid,
    studentEmail,
    courseId,
    selectedOptionId,
    amount,
    paymentMethod,
    razorpay_order_id,
    razorpay_payment_id,
    enrollmentDate,
  });

  return enrollment;
};

const getAllEnrollments = async () => {
  return await Enrollment.findAll({
    include: {
      model: CoursePriceOption,
      as: "selectedOption",
    },
  });
};

const getEnrollmentById = async (id) => {
  return await Enrollment.findByPk(id, {
    include: {
      model: CoursePriceOption,
      as: "selectedOption",
    },
  });
};

module.exports = {
  createEnrollment,
  getAllEnrollments,
  getEnrollmentById,
};
