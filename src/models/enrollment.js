const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const Enrollment = sequelize.define("Enrollment", {
    studentName: { type: DataTypes.STRING, allowNull: false },
    studentEmail: { type: DataTypes.STRING, allowNull: true },

    studentId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
    },

    courseId: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: "Courses", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "CASCADE",
    },

    selectedOptionId: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: "CoursePriceOptions", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
    },

    amount: { type: DataTypes.FLOAT, allowNull: false },
    paymentMethod: { type: DataTypes.STRING, allowNull: false },

    razorpay_order_id: { type: DataTypes.STRING },
    razorpay_payment_id: { type: DataTypes.STRING },

    enrollmentDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },

    // 🔑 THE CRITICAL ADDITION: Status column
    status: {
        type: DataTypes.ENUM('enrolled', 'trainer_assigned', 'in_progress', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'enrolled', // Initial status after payment
    },

    trainerId: {
        type: DataTypes.INTEGER,
        allowNull: true, // Null until a trainer is assigned
        references: { model: "Users", key: "id" },
        onUpdate: "CASCADE",
        onDelete: "SET NULL",
    },

    assignedAt: { 
        type: DataTypes.DATE, 
        allowNull: true // Date when trainer is assigned
    },

    courseStages: {
        type: DataTypes.JSON,
        defaultValue: [],
    },
});

module.exports = Enrollment;