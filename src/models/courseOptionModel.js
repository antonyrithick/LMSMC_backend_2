const { DataTypes } = require("sequelize");
const sequelize = require("../config/db");

const CoursePriceOption = sequelize.define("CoursePriceOption", {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
   courseId: {
  type: DataTypes.INTEGER,
  allowNull: false,
  references: {
    model: "Courses",
    key: "id"
  },
  onDelete: "CASCADE"
},
  optionName: {
    type: DataTypes.STRING,
    allowNull: false, // e.g., "Individual", "Small Group", "Large Group"
    defaultValue: 'Default Option',
  },
  studentCount: {
    type: DataTypes.INTEGER,
    allowNull: false, // e.g., 1, 3, 5
    validate: {
      min: 1
    }
  },
  trainerCount: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1, // e.g., 1, 2
    validate: {
      min: 1
    }
  },
  basePrice: {
    type: DataTypes.INTEGER,
    allowNull: false, // Base price for this option
  },
  discountPercent: {
    type: DataTypes.INTEGER,
    defaultValue: 0, // Discount percentage (0-100)
    validate: {
      min: 0,
      max: 100
    }
  },
  finalPrice: {
    type: DataTypes.VIRTUAL,
    get() {
      const base = this.getDataValue('basePrice');
      const discount = this.getDataValue('discountPercent');
      return base - (base * discount / 100);
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true, // Description of what this option includes
  },
  features: {
    type: DataTypes.JSON,
    allowNull: true, // Array of features for this pricing option
    defaultValue: []
  },
  maxEnrollments: {
    type: DataTypes.INTEGER,
    allowNull: true, // Maximum number of enrollments for this option
  },
  validFrom: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  validTo: {
    type: DataTypes.DATE,
    allowNull: true,
  }
}, {
  timestamps: true,
  tableName: 'CoursePriceOptions',
  indexes: [
    {
      fields: ['courseId']
    },
    {
      fields: ['isActive']
    }
  ]
});

// Define associations
CoursePriceOption.associate = (models) => {
  CoursePriceOption.belongsTo(models.Course, {
    foreignKey: 'courseId',
    as: 'course'
  });
};

module.exports = CoursePriceOption;