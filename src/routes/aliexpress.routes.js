const express = require('express');
const router = express.Router();
const { getAllAliExpressProducts } = require('../controllers/aliexpress.controller');

router.get('/products', getAllAliExpressProducts);

module.exports = router;