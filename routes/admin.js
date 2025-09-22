const express = require('express');
const router = express.Router();
const ShopifyAPIClient = require('../lib/shopify-api');
const { AppSettings, ProductRestrictions, CollectionExceptions, AccessLogs } = require('../lib/database');
const { validateShopSession, checkAppInstallation } = require('../middleware/access-control');

// Apply middleware to all admin routes
router.use(validateShopSession);
router.use(checkAppInstallation);

/**
 * GET /api/admin/dashboard
 * Get dashboard data for the admin interface
 */
router.get('/dashboard', async (req, res) => {
  try {
    const shopDomain = req.session.shop;
    const days = parseInt(req.query.days) || 30;
    
    const [
      settings,
      analytics,
      totalProducts,
      totalCollections
    ] = await Promise.all([
      AppSettings.get(shopDomain),
      AccessLogs.getAnalytics(shopDomain, days),
      ProductRestrictions.getAll(shopDomain),
      CollectionExceptions.getAll(shopDomain)
    ]);

    const shopifyClient = new ShopifyAPIClient(req.session);
    const allProducts = await shopifyClient.getAllProducts();
    const allCollections = await shopifyClient.getCollections();

    const dashboardData = {
      settings,
      analytics,
      stats: {
        totalProducts: allProducts.length,
        restrictedProducts: totalProducts.filter(p => p.is_restricted).length,
        totalCollections: allCollections.length,
        exceptionCollections: totalCollections.filter(c => c.is_exception).length,
        period: `${days} days`
      },
      recentActivity: analytics
    };

    res.json(dashboardData);
  } catch (error) {
    console.error('Dashboard data error:', error);
    res.status(500).json({ error: 'Dashboard data failed' });
  }
});

/**
 * PUT /api/admin/settings
 * Update app settings
 */
router.put('/settings', async (req, res) => {
  try {
    const shopDomain = req.session.shop;
    const {
      is_enabled,
      butterfly_paid_tag,
      certification_url,
      education_collections,
      pro_account_message,
      certification_message,
      pro_account_description,
      certification_description
    } = req.body;

    const settings = {
      is_enabled: is_enabled !== undefined ? is_enabled : true,
      butterfly_paid_tag: butterfly_paid_tag || 'butterfly_paid',
      certification_url: certification_url || 'https://maliaextensions.com/pages/certification',
      education_collections: education_collections || 'courses,in-person-education-1',
      pro_account_message: pro_account_message || 'PRO ACCOUNT REQUIRED',
      certification_message: certification_message || 'CERTIFICATION REQUIRED',
      pro_account_description: pro_account_description || 'MALIÁ PRODUCTS ARE AVAILABLE EXCLUSIVELY TO LICENSED HAIR STYLISTS.',
      certification_description: certification_description || 'GET CERTIFIED TO ACCESS PROFESSIONAL PRICING AND PLACE ORDERS.'
    };

    await AppSettings.createOrUpdate(shopDomain, settings);
    
    res.json({ 
      success: true, 
      message: 'Settings updated successfully',
      settings 
    });
  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({ error: 'Settings update failed' });
  }
});

/**
 * GET /api/admin/products
 * Get all products with pagination and filtering
 */
router.get('/products', async (req, res) => {
  try {
    const shopDomain = req.session.shop;
    const limit = parseInt(req.query.limit) || 50;
    const page = parseInt(req.query.page) || 1;
    const filter = req.query.filter || 'all'; // all, restricted, unrestricted
    const search = req.query.search || '';
    
    const shopifyClient = new ShopifyAPIClient(req.session);
    const { products, pageInfo } = await shopifyClient.getProducts(limit);
    
    // Get restriction status for each product
    const productsWithStatus = await Promise.all(
      products.map(async (product) => {
        const restriction = await ProductRestrictions.getByProduct(shopDomain, product.id);
        const isRestricted = restriction ? restriction.is_restricted : true; // Default to restricted
        
        return {
          id: product.id,
          title: product.title,
          handle: product.handle,
          product_type: product.product_type,
          vendor: product.vendor,
          isRestricted,
          customMessage: restriction?.custom_message || null,
          created_at: product.created_at,
          updated_at: product.updated_at
        };
      })
    );

    // Apply filters
    let filteredProducts = productsWithStatus;
    
    if (filter === 'restricted') {
      filteredProducts = filteredProducts.filter(p => p.isRestricted);
    } else if (filter === 'unrestricted') {
      filteredProducts = filteredProducts.filter(p => !p.isRestricted);
    }
    
    if (search) {
      const searchLower = search.toLowerCase();
      filteredProducts = filteredProducts.filter(p => 
        p.title.toLowerCase().includes(searchLower) ||
        p.handle.toLowerCase().includes(searchLower) ||
        p.product_type?.toLowerCase().includes(searchLower)
      );
    }

    res.json({
      products: filteredProducts,
      pageInfo,
      pagination: {
        page,
        limit,
        total: filteredProducts.length
      },
      filters: {
        current: filter,
        search
      }
    });
  } catch (error) {
    console.error('Admin products fetch error:', error);
    res.status(500).json({ error: 'Products fetch failed' });
  }
});

/**
 * PUT /api/admin/products/:productId/restriction
 * Update product restriction status
 */
router.put('/products/:productId/restriction', async (req, res) => {
  try {
    const { productId } = req.params;
    const shopDomain = req.session.shop;
    const { isRestricted, customMessage } = req.body;
    
    const shopifyClient = new ShopifyAPIClient(req.session);
    const product = await shopifyClient.getProduct(productId);
    
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    await ProductRestrictions.setRestriction(
      shopDomain,
      parseInt(productId),
      product.handle,
      isRestricted,
      customMessage
    );

    res.json({ 
      success: true, 
      message: 'Product restriction updated successfully',
      product: {
        id: product.id,
        title: product.title,
        handle: product.handle,
        isRestricted,
        customMessage
      }
    });
  } catch (error) {
    console.error('Product restriction update error:', error);
    res.status(500).json({ error: 'Product restriction update failed' });
  }
});

/**
 * POST /api/admin/products/bulk-update
 * Bulk update product restrictions
 */
router.post('/products/bulk-update', async (req, res) => {
  try {
    const shopDomain = req.session.shop;
    const { updates } = req.body; // Array of {productId, isRestricted, customMessage}
    
    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: 'Updates array required' });
    }

    const shopifyClient = new ShopifyAPIClient(req.session);
    const results = [];

    for (const update of updates) {
      try {
        const product = await shopifyClient.getProduct(update.productId);
        if (product) {
          await ProductRestrictions.setRestriction(
            shopDomain,
            update.productId,
            product.handle,
            update.isRestricted,
            update.customMessage
          );
          results.push({ productId: update.productId, success: true });
        } else {
          results.push({ productId: update.productId, success: false, error: 'Product not found' });
        }
      } catch (error) {
        results.push({ productId: update.productId, success: false, error: error.message });
      }
    }

    res.json({ 
      success: true, 
      message: 'Bulk update completed',
      results 
    });
  } catch (error) {
    console.error('Bulk update error:', error);
    res.status(500).json({ error: 'Bulk update failed' });
  }
});

/**
 * GET /api/admin/collections
 * Get all collections with exception status
 */
router.get('/collections', async (req, res) => {
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
    console.error('Admin collections fetch error:', error);
    res.status(500).json({ error: 'Collections fetch failed' });
  }
});

/**
 * PUT /api/admin/collections/:collectionId/exception
 * Update collection exception status
 */
router.put('/collections/:collectionId/exception', async (req, res) => {
  try {
    const { collectionId } = req.params;
    const shopDomain = req.session.shop;
    const { isException } = req.body;
    
    const shopifyClient = new ShopifyAPIClient(req.session);
    const collection = await shopifyClient.getCollection(collectionId);
    
    if (!collection) {
      return res.status(404).json({ error: 'Collection not found' });
    }

    await CollectionExceptions.setException(
      shopDomain,
      parseInt(collectionId),
      collection.handle,
      isException
    );

    res.json({ 
      success: true, 
      message: 'Collection exception updated successfully',
      collection: {
        id: collection.id,
        title: collection.title,
        handle: collection.handle,
        isException
      }
    });
  } catch (error) {
    console.error('Collection exception update error:', error);
    res.status(500).json({ error: 'Collection exception update failed' });
  }
});

/**
 * GET /api/admin/analytics
 * Get detailed analytics
 */
router.get('/analytics', async (req, res) => {
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

module.exports = router;


