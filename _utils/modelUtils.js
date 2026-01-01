function getDAOCommandModel(req) {
  const { DAOCommand } = req.models || {};
  if (!DAOCommand) {
    throw { status: 500, message: 'DAOCommand model is not attached to req.models' };
  }
  return DAOCommand;
}

module.exports = {
  getDAOCommandModel,
};
