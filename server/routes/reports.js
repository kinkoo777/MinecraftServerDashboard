const express = require('express');
const reports = require('../reports');

const router = express.Router();

router.get('/', (req, res) => res.json(reports.list()));

module.exports = router;
