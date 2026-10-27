const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Customer: Submit a new review
exports.addReview = async (req, res) => {
  try {
    const { productId, rating, comment, user_info, images } = req.body;
    
    console.log("RECEIVED REVIEW DATA:", { productId, rating, comment, user_info, images });

    const newReview = await prisma.review.create({
      data: {
        productId: productId || "",
        rating: Number(rating) || 5,
        comment: comment || "",
        user_info: user_info || {},
        images: images || [],
        status: 'pending'
      }
    });

    // Real-time: Emit socket event so Admin Panel sees it instantly without refreshing
    const io = req.app.get('io');
    if (io) {
      io.emit('newReviewPending', newReview);
    }
    
    res.status(201).json({ 
      success: true, 
      message: 'Your review has been submitted successfully and will be visible after admin approval.',
      newReview
    });
  } catch (error) {
    console.error("DETAILED REVIEW ERROR:", error);
    res.status(500).json({ 
      success: false, 
      message: error.message || 'Server error occurred',
      detailedError: JSON.stringify(error, Object.getOwnPropertyNames(error))
    });
  }
};

// Admin: Get all pending reviews
exports.getPendingReviews = async (req, res) => {
  try {
    const pendingReviews = await prisma.review.findMany({
      where: { status: 'pending' }
    });
    res.status(200).json({ success: true, pendingReviews });
  } catch (error) {
    console.error("Error fetching pending reviews:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: Approve a pending review
exports.approveReview = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedReview = await prisma.review.update({
      where: { id },
      data: { status: 'approved' }
    });

    // Real-time: Emit socket event so Customer Web shows it instantly without refreshing
    const io = req.app.get('io');
    if (io) {
      io.emit('reviewApproved', updatedReview);
    }
    
    res.status(200).json({ success: true, message: 'Review approved successfully.', updatedReview });
  } catch (error) {
    console.error("Error approving review:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Admin: Delete a review
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedReview = await prisma.review.delete({
      where: { id }
    });

    res.status(200).json({ success: true, message: 'Review deleted successfully.' });
  } catch (error) {
    console.error("Error deleting review:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Customer: Get approved reviews for a specific product
exports.getProductReviews = async (req, res) => {
  try {
    const { productId } = req.params;
    const reviews = await prisma.review.findMany({
      where: { 
        productId: productId,
        status: 'approved' 
      },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json({ success: true, reviews });
  } catch (error) {
    console.error("Error fetching product reviews:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};