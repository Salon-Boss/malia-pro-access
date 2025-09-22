const express = require('express');
const router = express.Router();
const { AppSettings, ProductRestrictions, CollectionExceptions } = require('../lib/database');

/**
 * POST /api/webhooks/app/uninstalled
 * Handle app uninstallation webhook
 */
router.post('/app/uninstalled', async (req, res) => {
  try {
    const shopDomain = req.body.domain;
    
    if (!shopDomain) {
      return res.status(400).json({ error: 'Shop domain required' });
    }

    console.log(`App uninstalled for shop: ${shopDomain}`);
    
    // Clean up app data
    const { db } = require('../lib/database');
    
    await db('app_settings').where('shop_domain', shopDomain).del();
    await db('product_restrictions').where('shop_domain', shopDomain).del();
    await db('collection_exceptions').where('shop_domain', shopDomain).del();
    // Keep access_logs for potential analytics

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('App uninstalled webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/webhooks/customers/update
 * Handle customer update webhook
 */
router.post('/customers/update', async (req, res) => {
  try {
    const customer = req.body;
    const shopDomain = req.headers['x-shopify-shop-domain'];
    
    if (!customer || !shopDomain) {
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    console.log(`Customer updated: ${customer.id} in shop: ${shopDomain}`);
    
    // Log customer tag changes for analytics
    if (customer.tags && customer.tags.includes('butterfly_paid')) {
      console.log(`Customer ${customer.id} now has butterfly_paid tag`);
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Customer update webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/webhooks/orders/create
 * Handle order creation webhook
 */
router.post('/orders/create', async (req, res) => {
  try {
    const order = req.body;
    const shopDomain = req.headers['x-shopify-shop-domain'];
    
    if (!order || !shopDomain) {
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    console.log(`Order created: ${order.id} in shop: ${shopDomain}`);
    
    // Check if order contains restricted products
    const ShopifyAPIClient = require('../lib/shopify-api');
    const shopifyClient = new ShopifyAPIClient({ shop: shopDomain });
    
    const restrictedItems = [];
    
    for (const lineItem of order.line_items) {
      const isRestricted = await shopifyClient.isProductRestricted(lineItem.product_id, shopDomain);
      if (isRestricted) {
        restrictedItems.push(lineItem);
      }
    }

    if (restrictedItems.length > 0) {
      console.log(`Order ${order.id} contains restricted items:`, restrictedItems);
      
      // Validate customer access
      const accessResult = await shopifyClient.validateCustomerAccess(order.customer?.id);
      
      if (!accessResult.hasAccess) {
        console.log(`Order ${order.id} should be cancelled - customer lacks access`);
        // In a production app, you might want to automatically cancel the order
        // or send a notification to the merchant
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Order create webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/webhooks/products/create
 * Handle product creation webhook
 */
router.post('/products/create', async (req, res) => {
  try {
    const product = req.body;
    const shopDomain = req.headers['x-shopify-shop-domain'];
    
    if (!product || !shopDomain) {
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    console.log(`Product created: ${product.id} in shop: ${shopDomain}`);
    
    // Set default restriction status for new products
    // Default to restricted (pro-only) unless in education collections
    const settings = await AppSettings.get(shopDomain);
    if (settings) {
      const educationCollections = settings.education_collections?.split(',') || [];
      
      // Check if product is in education collections
      let isException = false;
      if (product.product_type) {
        isException = educationCollections.some(collection => 
          product.product_type.toLowerCase().includes(collection.toLowerCase())
        );
      }
      
      await ProductRestrictions.setRestriction(
        shopDomain,
        product.id,
        product.handle,
        !isException, // Restricted unless it's an education product
        null
      );
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Product create webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/webhooks/products/update
 * Handle product update webhook
 */
router.post('/products/update', async (req, res) => {
  try {
    const product = req.body;
    const shopDomain = req.headers['x-shopify-shop-domain'];
    
    if (!product || !shopDomain) {
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    console.log(`Product updated: ${product.id} in shop: ${shopDomain}`);
    
    // Update restriction status if product type changed
    const settings = await AppSettings.get(shopDomain);
    if (settings) {
      const educationCollections = settings.education_collections?.split(',') || [];
      
      // Check if product is in education collections
      let isException = false;
      if (product.product_type) {
        isException = educationCollections.some(collection => 
          product.product_type.toLowerCase().includes(collection.toLowerCase())
        );
      }
      
      // Only update if the restriction status should change
      const currentRestriction = await ProductRestrictions.getByProduct(shopDomain, product.id);
      if (currentRestriction && currentRestriction.is_restricted === isException) {
        await ProductRestrictions.setRestriction(
          shopDomain,
          product.id,
          product.handle,
          !isException,
          currentRestriction.custom_message
        );
      }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Product update webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * POST /api/webhooks/products/delete
 * Handle product deletion webhook
 */
router.post('/products/delete', async (req, res) => {
  try {
    const product = req.body;
    const shopDomain = req.headers['x-shopify-shop-domain'];
    
    if (!product || !shopDomain) {
      return res.status(400).json({ error: 'Invalid webhook data' });
    }

    console.log(`Product deleted: ${product.id} in shop: ${shopDomain}`);
    
    // Clean up product restriction data
    const { db } = require('../lib/database');
    await db('product_restrictions').where({ shop_domain: shopDomain, product_id: product.id }).del();

    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Product delete webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

module.exports = router;


