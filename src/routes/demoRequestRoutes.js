const express = require('express');
const router = express.Router();
const demoRequestController = require('../controllers/demoRequestController');
const trainerAvailabilityController = require('../controllers/trainerAvailabilityController');
const demoSessionController = require('../controllers/demoSessionController');

// Demo Request Routes
router.post('/demo-requests', demoRequestController.createDemoRequest);
router.get('/demo-requests', demoRequestController.getAllDemoRequests);
router.get('/demo-requests/student/:studentId', demoRequestController.getStudentDemoRequests);
router.get('/demo-requests/trainer/:trainerId', demoRequestController.getTrainerDemoRequests);
router.put('/demo-requests/:id/approve', demoRequestController.approveDemoRequest);
router.put('/demo-requests/:id/reject', demoRequestController.rejectDemoRequest);

// Trainer Availability Routes
router.post('/trainer-availability', trainerAvailabilityController.setTrainerAvailability);
router.get('/trainer-availability/:trainerId', trainerAvailabilityController.getTrainerAvailability);
router.get('/available-trainers', trainerAvailabilityController.getAvailableTrainers);
router.put('/trainer-availability/:id', trainerAvailabilityController.updateTrainerAvailability);

// Demo Session Routes
router.get('/demo-sessions', demoSessionController.getAllDemoSessions);
router.put('/demo-sessions/:id', demoSessionController.updateDemoSession);

module.exports = router;