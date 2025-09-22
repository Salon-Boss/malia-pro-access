const express = require('express');
const router = express.Router();
const ShopifyAPIClient = require('../lib/shopify-api');
const { AppSettings, ProductRestrictions, CollectionExceptions, AccessLogs } = require('../lib/database');
const { validateCustomerAccess, validateShopSession, createRateLimit } = require('../middleware/access-control');

// Rate limiting
const rateLimit = createRateLimit(15 * 60 * 1000, 100); // 100 requests per 15 minutes

// Apply rate limiting to all API routes
router.use(rateLimit);

/**
 * GET /api/check-access/:productId/:customerId
 * Check if a customer has access to a specific product
 */
router.get('/check-access/:productId/:customerId', validateShopSession, async (req, res) => {
  try {
    const { productId, customerId } = req.params;
    const shopDomain = req.session.shop;
    
    const shopifyClient = new ShopifyAPIClient(req.session);
    const isRestricted = await shopifyClient.isProductRestricted(productId, shopDomain);
    
    if (!isRestricted) {
      return res.json({ hasAccess: true, reason: 'not_restricted' });
    }

    const accessResult = await shopifyClient.validateCustomerAccess(customerId);
    
    // Log access attempt
    await AccessLogs.log(
      shopDomain,
      productId,
      customerId,
      accessResult.hasAccess ? 'allowed' : accessResult.reason,
      req.ip,
      req.get('User-Agent')
    );

    res.json(accessResult);
  } catch (error) {
    console.error('Access check error:', error);
    res.status(500).json({ error: 'Access check failed' });
  }
});

/**
 * GET /api/product-status/:productId
 * Get the restriction status of a product
 */
router.get('/product-status/:productId', validateShopSession, async (req, res) => {
  try {
    const { productId } = req.params;
    const shopDomain = req.session.shop;
    
    const shopifyClient = new ShopifyAPIClient(req.session);
    const isRestricted = await shopifyClient.isProductRestricted(productId, shopDomain);
    
    res.json({ 
      productId: parseInt(productId),
      isRestricted,
      shopDomain 
    });
  } catch (error) {
    console.error('Product status check error:', error);
    res.status(500).json({ error: 'Product status check failed' });
  }
});

/**
 * GET /api/customer-status/:customerId
 * Get the access status of a customer
 */
router.get('/customer-status/:customerId', validateShopSession, async (req, res) => {
  try {
    const { customerId } = req.params;
    
    const shopifyClient = new ShopifyAPIClient(req.session);
    const accessResult = await shopifyClient.validateCustomerAccess(customerId);
    
    res.json({
      customerId: parseInt(customerId),
      hasAccess: accessResult.hasAccess,
      reason: accessResult.reason,
      customer: accessResult.customer ? {
        id: accessResult.customer.id,
        email: accessResult.customer.email,
        tags: accessResult.customer.tags
      } : null
    });
  } catch (error) {
    console.error('Customer status check error:', error);
    res.status(500).json({ error: 'Customer status check failed' });
  }
});

/**
 * GET /api/analytics
 * Get access analytics for the shop
 */
router.get('/analytics', validateShopSession, async (req, res) => {
  try {
    const shopDomain = req.session.shop;
    const days = parseInt(req.query.days) || 30;
    
    const analytics = await AccessLogs.getAnalytics(shopDomain, days);
    
    res.json({
      shopDomain,
      period: `${days} days`,
      analytics
    });
  } catch (error) {
    console.error('Analytics error:', error);
    res.status(500).json({ error: 'Analytics failed' });
  }
});

/**
 * POST /api/validate-cart
 * Validate all items in a cart for access restrictions
 */
router.post('/validate-cart', validateShopSession, async (req, res) => {
  try {
    const { cartItems, customerId } = req.body;
    const shopDomain = req.session.shop;
    
    if (!cartItems || !Array.isArray(cartItems)) {
      return res.status(400).json({ error: 'Cart items required' });
    }

    const shopifyClient = new ShopifyAPIClient(req.session);
    const accessResult = await shopifyClient.validateCustomerAccess(customerId);
    
    const validationResults = [];
    
    for (const item of cartItems) {
      const isRestricted = await shopifyClient.isProductRestricted(item.product_id, shopDomain);
      
      validationResults.push({
        productId: item.product_id,
        variantId: item.variant_id,
        quantity: item.quantity,
        isRestricted,
        hasAccess: !isRestricted || accessResult.hasAccess,
        reason: isRestricted ? accessResult.reason : 'not_restricted'
      });
    }

    const hasRestrictedItems = validationResults.some(result => result.isRestricted && !result.hasAccess);
    
    res.json({
      valid: !hasRestrictedItems,
      customerAccess: accessResult,
      items: validationResults,
      restrictedItems: validationResults.filter(result => result.isRestricted && !result.hasAccess)
    });
  } catch (error) {
    console.error('Cart validation error:', error);
    res.status(500).json({ error: 'Cart validation failed' });
  }
});

/**
 * GET /api/settings
 * Get app settings for the shop
 */
router.get('/settings', validateShopSession, async (req, res) => {
  try {
    const shopDomain = req.session.shop;
    const settings = await AppSettings.get(shopDomain);
    
    if (!settings) {
      return res.status(404).json({ error: 'Settings not found' });
    }

    res.json(settings);
  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({ error: 'Settings fetch failed' });
  }
});

/**
 * GET /api/products
 * Get all products with their restriction status
 */
router.get('/products', validateShopSession, async (req, res) => {
  try {
    const shopDomain = req.session.shop;
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const offset = (page - 1) * limit;
    
    const shopifyClient = new ShopifyAPIClient(req.session);
    const { products, pageInfo } = await shopifyClient.getProducts(limit);
    
    // Get restriction status for each product
    const productsWithStatus = await Promise.all(
      products.map(async (product) => {
        const isRestricted = await shopifyClient.isProductRestricted(product.id, shopDomain);
        return {
          id: product.id,
          title: product.title,
          handle: product.handle,
          product_type: product.product_type,
          vendor: product.vendor,
          isRestricted,
          created_at: product.created_at,
          updated_at: product.updated_at
        };
      })
    );

    res.json({
      products: productsWithStatus,
      pageInfo,
      pagination: {
        page,
        limit,
        offset
      }
    });
  } catch (error) {
    console.error('Products fetch error:', error);
    res.status(500).json({ error: 'Products fetch failed' });
  }
});

/**
 * GET /api/collections
 * Get all collections with their exception status
 */
router.get('/collections', validateShopSession, async (req, res) => {
  try {
    const shopDomain = req.session.shop;
    
    const shopifyClient = new ShopifyAPIClient(req.session);
    const collections = await shopifyClient.getCollections();
    const exceptions = await CollectionExceptions.getAll(shopDomain);
    
    const collectionsWithStatus = collections.map(collection => {
      const exception = exceptions.find(ex => ex.collection_id === collection.id);
      return {
        id: collection.id,
        title: collection.title,
        handle: collection.handle,
        isException: exception ? exception.is_exception : false,
        created_at: collection.created_at,
        updated_at: collection.updated_at
      };
    });

    res.json({ collections: collectionsWithStatus });
  } catch (error) {
    console.error('Collections fetch error:', error);
    res.status(500).json({ error: 'Collections fetch failed' });
  }
});

module.exports = router;


