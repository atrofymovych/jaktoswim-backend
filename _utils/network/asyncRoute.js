const asyncRoute = (fn) => (req, res) =>
  fn(req, res).catch((err) => {
    console.error('🛑  daoCommands error:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error' });
  });

module.exports = { asyncRoute };
