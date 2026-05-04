const express = require('express');
const { getCustomers, getCustomer } = require('../controllers/customerController');
const { protect } = require('../middlewares/authMiddleware');

const router = express.Router();

router.use(protect);

router.get('/', getCustomers);
router.get('/:id', getCustomer);

module.exports = router;
