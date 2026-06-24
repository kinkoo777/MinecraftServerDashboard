const express = require('express');
const reports = require('../reports');

const router = express.Router();

router.get('/', (req, res, next) => {
  try { res.json(reports.list()); }
  catch (e) { next(e); }
});

module.exports = router;
