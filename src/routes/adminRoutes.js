const express = require("express");
const router = express.Router();
const adminController = require("../controllers/adminController");

// Unified Admin API
router.post("/", adminController.createAdmin);
router.get("/", adminController.getAllAdmins);
router.get("/:id", adminController.getAdminById);
router.put("/:id", adminController.updateAdmin);
router.delete("/:id", adminController.deleteAdmin);
router.get("/getroles/:id",adminController.superAdminView);

module.exports = router;
