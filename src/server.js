require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/product.routes');
const orderRoutes = require('./routes/order.routes');
const adminRoutes = require('./routes/admin.routes');
const paymentRoutes = require('./routes/payment.routes');
const bannerRoutes = require('./routes/banner.routes');
const riderRoutes = require('./routes/rider.routes');
const adminRiderRoutes = require('./routes/adminRider.routes');
const vendorRoutes = require('./routes/vendor.routes');
const walletRoutes = require('./routes/wallet.routes');
const paymentSettingsRoutes = require('./routes/paymentSettings.routes');
const cryptoRoutes = require('./routes/crypto.routes');
const payoutRoutes = require('./routes/payout.routes');
const platformSettingsRoutes = require('./routes/platformSettings.routes');
const thirdPartyOrderRoutes = require('./routes/thirdPartyOrder.routes');
const vendorImportRoutes = require('./routes/vendorimport.routes');
const reviewRoutes = require('./routes/review.routes');
const aliexpressRoutes = require('./routes/aliexpress.routes');

const { errorHandler, notFound } = require('./middleware/error.middleware');
const { initRealtime } = require('./realtime');

const app = express();

const allowedOrigins = [process.env.CUSTOMER_URL, process.env.ADMIN_URL, process.env.RIDER_URL].filter(Boolean);

app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins.length ? allowedOrigins : true,
    credentials: true,
  })
);
app.use(express.json({ limit: '15mb' }));
app.use(cookieParser());
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 300 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100000 });
app.use(generalLimiter);

app.get('/', (req, res) => {
  res.json({ message: 'Delicious Sheri API is running successfully' });
});

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'delicious-sheri-api' }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', authLimiter, adminRoutes);
app.use('/api/payments', paymentRoutes);

// Mount banner routes for both public and admin access
app.use('/api/banners', bannerRoutes);
app.use('/api/admin/banners', bannerRoutes);

app.use('/api/riders', riderRoutes);
app.use('/api/admin/riders', authLimiter, adminRiderRoutes);
app.use('/api/admin/vendors', authLimiter, vendorRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/payment-settings', paymentSettingsRoutes);
app.use('/api/crypto', cryptoRoutes);
app.use('/api/admin/payouts', authLimiter, payoutRoutes);
app.use('/api/admin/settings', authLimiter, platformSettingsRoutes);
app.use('/api/third-party-orders', thirdPartyOrderRoutes);
app.use('/api/admin/vendor-import', authLimiter, vendorImportRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/aliexpress', aliexpressRoutes);

app.use(notFound);
app.use(errorHandler);

const httpServer = http.createServer(app);
initRealtime(httpServer);

const PORT = process.env.PORT || 5000;
httpServer.listen(PORT, () => console.log(`Delicious Sheri API + realtime running on port ${PORT}`));

module.exports = app;