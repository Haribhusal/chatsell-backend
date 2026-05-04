const Order = require('../models/Order');
const Customer = require('../models/Customer');

// @desc    Get dashboard statistics
// @route   GET /api/dashboard/stats
// @access  Private
exports.getDashboardStats = async (req, res) => {
  try {
    const userId = req.user._id;

    // Total Orders
    const totalOrders = await Order.countDocuments({ userId });

    // Total Revenue (only for confirmed or delivered orders maybe? Spec doesn't specify, I'll sum all for now or maybe exclude cancelled)
    const revenueResult = await Order.aggregate([
      { $match: { userId, status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

    // New Customers (total count for MVP)
    const totalCustomers = await Customer.countDocuments({ userId });

    // Recent Orders (last 5)
    const recentOrders = await Order.find({ userId })
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('products.productId', 'name price');

    res.status(200).json({
      success: true,
      data: {
        totalOrders,
        totalRevenue,
        totalCustomers,
        recentOrders
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
