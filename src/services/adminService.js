const User = require("../models/userModel");
const Role = require("../models/roleModel");
const Message = require("../models/messageModel");
const bcrypt = require("bcryptjs");
const { sequelize } = require("../models");
const { Op } = require("sequelize");
const allowedRoles = ["business admin", "technical admin", "trainer"];

// Create Admin
exports.createAdmin = async (data) => {
  const { name, email, password, mobile, role,specialist } = data;

  // 1. Validate role
  if (!allowedRoles.includes(role)) {
    throw new Error("Invalid role. Only business admin, technical admin, or trainer allowed.");
  }

  // 2. Get role from DB
  const roleRecord = await Role.findOne({ where: { name: role } });
  if (!roleRecord) throw new Error("Role not found");

  // 3. Check for existing user
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) throw new Error("Email already in use");

  // 4. Hash password
  const hashedPassword = await bcrypt.hash(password, 10);

  // 5. Create and return user
  const newUser = await User.create({
    name,
    email,
    mobile,
    specialist,
    password: hashedPassword,
    RoleId: roleRecord.id,
  });

  return {
    message: "Admin created successfully",
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      mobile: newUser.mobile,
      role: roleRecord.name,
      specialist: newUser.specialist,
    }
  };
};
// Get All Admins
exports.getAllAdmins = async () => {
  const roles = await Role.findAll({ where: { name: allowedRoles } });
  const roleIds = roles.map((role) => role.id);

  return await User.findAll({
    where: { RoleId: { [Op.in]: roleIds } },
    include: [Role],
  });
};

// Get Admin by ID
exports.getAdminById = async (id) => {
  const user = await User.findByPk(id, { include: [Role] });

  if (!user || !allowedRoles.includes(user.Role.name)) {
    throw new Error("Admin not found or role not allowed");
  }

  return user;
};

// Update Admin by ID
exports.updateAdmin = async (id, data) => {
  const user = await User.findByPk(id, { include: [Role] });
  if (!user || !allowedRoles.includes(user.Role.name)) {
    throw new Error("Admin not found or role not allowed");
  }

  // Optional: update role if passed
  if (data.role) {
    if (!allowedRoles.includes(data.role)) {
      throw new Error("Invalid role for update");
    }
    const role = await Role.findOne({ where: { name: data.role } });
    if (!role) throw new Error("Role not found");
    data.RoleId = role.id;
  }

  return await user.update(data);
};

// Delete Admin by ID (and messages)
exports.deleteAdmin = async (id) => {
  const transaction = await sequelize.transaction();

  try {
    const user = await User.findByPk(id, { include: [Role], transaction });
    if (!user || !allowedRoles.includes(user.Role.name)) {
      throw new Error("Admin not found or role not allowed");
    }

    await Message.destroy({
      where: {
        [Op.or]: [{ senderId: id }, { receiverId: id }],
      },
      transaction,
    });

    await user.destroy({ transaction });
    await transaction.commit();

    return { message: "Admin and messages deleted successfully" };
  } catch (err) {
    await transaction.rollback();
    throw err;
  }
};
