const User = require("../models/userModel");
const Role = require("../models/roleModel");
const Message = require("../models/messageModel");
const { sequelize } = require("../models");
const { Op } = require("sequelize");
exports.getAllTrainers = async () => {
  const role = await Role.findOne({ where: { name: "trainer" } });
  if (!role) throw new Error("Trainer role not found");

  return await User.findAll({
    where: { RoleId: role.id },
    include: [Role],
  });
};

exports.getTrainerById = async (id) => {
  const user = await User.findByPk(id, {
    include: [Role],
  });

  if (!user || user.Role.name !== "trainer") {
    throw new Error("Trainer not found");
  }

  return user;
};


exports.createTrainer = async (data) => {
  const role = await Role.findOne({ where: { name: "trainer" } });
  if (!role) throw new Error("Trainer role not found");

  return await User.create({ ...data, RoleId: role.id });
};

exports.updateTrainer = async (id, data) => {
  const trainer = await User.findByPk(id);
  if (!trainer) throw new Error("Trainer not found");

  return await trainer.update(data);
};

exports.deleteTrainer = async (id) => {
  const transaction = await sequelize.transaction();

  try {
    const trainer = await User.findByPk(id, { transaction });
    if (!trainer) {
      throw new Error("Trainer not found");
    }

    // Delete all messages where user is sender or receiver
    await Message.destroy({
      where: {
        [Op.or]: [
          { senderId: id },
          { receiverId: id }
        ]
      },
      transaction
    });

    // Delete the trainer
    await trainer.destroy({ transaction });

    await transaction.commit();
    return { message: "Trainer and related messages deleted successfully" };
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
};
