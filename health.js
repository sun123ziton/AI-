module.exports = (req, res) => {
  res.status(200).json({
    ok: true,
    message: 'API is reachable',
    time: new Date().toISOString()
  });
};
