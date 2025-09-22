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

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    message: 'Malia Pro Access App is running!',
    environment: process.env.NODE_ENV || 'development'
  });
});

// Basic API endpoints
app.get('/api/auth/status', (req, res) => {
  res.json({
    installed: false,
    shopDomain: req.query.shop || 'test-shop.myshopify.com',
    settings: null,
    appUrl: process.env.SHOPIFY_APP_URL
  });
});

app.get('/api/auth/install', async (req, res) => {
  try {
    const shopDomain = req.query.shop;
    
    if (!shopDomain) {
      return res.status(400).json({ error: 'Shop domain required' });
    }

    // Initialize default settings
    const defaultSettings = {
      is_enabled: true,
      butterfly_paid_tag: 'butterfly_paid',
      certification_url: 'https://maliaextensions.com/pages/certification',
      education_collections: 'courses,in-person-education-1',
      pro_account_message: 'PRO ACCOUNT REQUIRED',
      certification_message: 'CERTIFICATION REQUIRED',
      pro_account_description: 'MALIÁ PRODUCTS ARE AVAILABLE EXCLUSIVELY TO LICENSED HAIR STYLISTS.',
      certification_description: 'GET CERTIFIED TO ACCESS PROFESSIONAL PRICING AND PLACE ORDERS.'
    };

    res.json({ 
      success: true, 
      message: 'App installed successfully',
      settings: defaultSettings 
    });
  } catch (error) {
    console.error('App installation error:', error);
    res.status(500).json({ error: 'App installation failed' });
  }
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
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
