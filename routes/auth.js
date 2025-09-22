const express = require('express');
const router = express.Router();
const { AppSettings } = require('../lib/database');

/**
 * GET /api/auth/install
 * Install the app and initialize settings
 */
router.get('/install', async (req, res) => {
  try {
    const shopDomain = req.session?.shop || req.query.shop;
    
    if (!shopDomain) {
      return res.status(400).json({ error: 'Shop domain required' });
    }

    // Check if app is already installed
    const existingSettings = await AppSettings.get(shopDomain);
    
    if (existingSettings) {
      return res.json({ 
        success: true, 
        message: 'App already installed',
        settings: existingSettings 
      });
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

    await AppSettings.createOrUpdate(shopDomain, defaultSettings);

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

/**
 * GET /api/auth/uninstall
 * Uninstall the app and clean up data
 */
router.get('/uninstall', async (req, res) => {
  try {
    const shopDomain = req.session?.shop || req.query.shop;
    
    if (!shopDomain) {
      return res.status(400).json({ error: 'Shop domain required' });
    }

    // Note: In a production app, you might want to keep some data for analytics
    // or provide a way to reinstall without losing settings
    const { db } = require('../lib/database');
    
    await db('app_settings').where('shop_domain', shopDomain).del();
    await db('product_restrictions').where('shop_domain', shopDomain).del();
    await db('collection_exceptions').where('shop_domain', shopDomain).del();
    // Keep access_logs for potential reinstall analytics

    res.json({ 
      success: true, 
      message: 'App uninstalled successfully' 
    });
  } catch (error) {
    console.error('App uninstallation error:', error);
    res.status(500).json({ error: 'App uninstallation failed' });
  }
});

/**
 * GET /api/auth/status
 * Check app installation status
 */
router.get('/status', async (req, res) => {
  try {
    const shopDomain = req.session?.shop || req.query.shop;
    
    if (!shopDomain) {
      return res.status(400).json({ error: 'Shop domain required' });
    }

    const settings = await AppSettings.get(shopDomain);
    
    res.json({
      installed: !!settings,
      shopDomain,
      settings: settings || null
    });
  } catch (error) {
    console.error('App status check error:', error);
    res.status(500).json({ error: 'App status check failed' });
  }
});

module.exports = router;


