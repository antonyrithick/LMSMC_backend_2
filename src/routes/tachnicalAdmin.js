const express = require('express');
const router = express.Router();
const { 
  createCourse, 
  getMyCourses, 
  updateCourse, 
  toggleCoursePublish 
} = require('../controllers/coursesController');

// Middleware to verify authentication (you need to implement this)
const { verifyToken } = require("../middleware/socketAuth");

// Middleware to check if user is technical admin
const checkTechnicalAdmin = (req, res, next) => {
  if (req.user.role_id !== 3) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Only technical admins can access this resource."
    });
  }
  next();
};

// Routes for technical admin course management
router.post('/create', verifyToken, checkTechnicalAdmin, creaQQteCourse);
router.get('/my-courses', verifyToken, checkTechnicalAdmin, getMyCourses);
router.put('/update/:courseId', verifyToken, checkTechnicalAdmin, updateCourse);
router.patch('/toggle-publish/:courseId', verifyToken, checkTechnicalAdmin, toggleCoursePublish);

module.exports = router;