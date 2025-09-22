const express = require('express');
const session = require('express-session');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

// Initialize database
const { setupDatabase } = require('./lib/database');

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware
app.use(helmet({
  contentSecurityPolicy: false, // Disable for Shopify embedded apps
}));
app.use(compression());
app.use(morgan('combined'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'fallback-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
}));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Import routes - CRITICAL: These are needed for admin dashboard
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const liveShopifyAdminRoutes = require('./routes/live-shopify-admin'); // Using live Shopify data
const webhookRoutes = require('./routes/webhooks');

// Use routes - CRITICAL: These enable all API endpoints
app.use('/api/auth', authRoutes);
app.use('/api', apiRoutes);
app.use('/api/admin', liveShopifyAdminRoutes); // Using live Shopify data for admin
app.use('/api/webhooks', webhookRoutes);

// Root route - redirect to admin interface
app.get('/', (req, res) => {
  res.redirect('/admin.html');
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    message: 'Malia Pro Access App is running! v2.0.0 - 3-Tier Access System',
    environment: process.env.NODE_ENV || 'development',
    shopify_store: process.env.SHOPIFY_STORE_DOMAIN || 'not-configured',
    access_tiers: ['Public', 'Verified', 'Butterfly Paid']
  });
});

// Admin interface
app.get('/admin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Initialize database and start server
async function startServer() {
  try {
    await setupDatabase();
    console.log('✅ Database initialized successfully');
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Malia Pro Access App running on port ${PORT}`);
      console.log(`📱 App URL: ${process.env.SHOPIFY_APP_URL || 'http://localhost:' + PORT}`);
      console.log(`🏪 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log('🔧 API Routes enabled: auth, api, admin, webhooks');
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;