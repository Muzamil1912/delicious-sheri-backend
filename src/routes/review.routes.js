const express = require('express');
const router = express.Router();
const reviewController = require('../controllers/review.controller');

// POST request for adding a review (Customer side)
router.post('/add', reviewController.addReview);

// GET request for fetching pending reviews (Admin side)
router.get('/pending', reviewController.getPendingReviews);

// PUT request for approving a review (Admin side)
router.put('/:id/approve', reviewController.approveReview);

// DELETE request for deleting a review (Admin side)
router.delete('/:id', reviewController.deleteReview);

// GET request for fetching approved reviews for a specific product (Customer side)
router.get('/product/:productId', reviewController.getProductReviews);

module.exports = router;