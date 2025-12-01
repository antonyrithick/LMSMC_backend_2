const express = require("express");
const router = express.Router();
const trainerController = require("../controllers/trainerController");
const auth = require("../middleware/authMiddleware");


router.get("/trainer", trainerController.getTrainerReport);
router.get("/trainer/:id", auth, trainerController.getTrainerById);
router.post("/trainer", auth, trainerController.createTrainer);
router.put("/trainer/:id", auth, trainerController.updateTrainer);
router.delete("/trainer/:id", auth, trainerController.deleteTrainer);

module.exports = router;
