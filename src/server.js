const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const bannerRoutes = require('./routes/banner.routes');
const cryptoRoutes = require('./routes/crypto.routes');
const deliveryBoyRoutes = require('./routes/deliveryBoyRoutes');
const orderRoutes = require('./routes/order.routes');
const paymentSettingsRoutes = require('./routes/paymentSettings.routes');
const payoutRoutes = require('./routes/payout.routes');
const platformSettingsRoutes = require('./routes/platformSettings.routes');
const productRoutes = require('./routes/product.routes');
const reviewRoutes = require('./routes/review.routes');
const riderRoutes = require('./routes/rider.routes');
const thirdPartyOrderRoutes = require('./routes/thirdPartyOrder.routes');
const vendorRoutes = require('./routes/vendor.routes');
const vendorImportRoutes = require('./routes/vendorimport.routes.');
const walletRoutes = require('./routes/wallet.routes');

const { errorHandler, notFound } = require('./middleware/error.middleware');
const { realtime } = require('./realtime');

const app = express();

const allowedOrigins = [
  process.env.CUSTOMER_URL,
  process.env.ADMIN_URL,
  process.env.RIDER_URL
];

app.use(helmet());
app.use(cors({
  origin: allowedOrigins,
  credentials: true
}));
app.use(express.json());

app.use('/api/banner', bannerRoutes);
app.use('/api/crypto', cryptoRoutes);
app.use('/api/delivery-boy', deliveryBoyRoutes);
app.use('/api/order', orderRoutes);
app.use('/api/payment-settings', paymentSettingsRoutes);
app.use('/api/payout', payoutRoutes);
app.use('/api/platform-settings', platformSettingsRoutes);
app.use('/api/product', productRoutes);
app.use('/api/review', reviewRoutes);
app.use('/api/rider', riderRoutes);
app.use('/api/third-party-order', thirdPartyOrderRoutes);
app.use('/api/vendor', vendorRoutes);
app.use('/api/vendor-import', vendorImportRoutes);
app.use('/api/wallet', walletRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});