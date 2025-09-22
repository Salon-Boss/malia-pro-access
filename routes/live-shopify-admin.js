const express = require('express');
const https = require('https');
const router = express.Router();

// Helper function to make Shopify API requests
async function makeShopifyRequest(path) {
  return new Promise((resolve, reject) => {
    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;

    if (!storeDomain || !accessToken) {
      return reject(new Error('Missing Shopify credentials in environment variables'));
    }

    const options = {
      hostname: storeDomain,
      path: `/admin/api/2024-01/${path}`,
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Failed to parse Shopify API response: ${e.message}`));
          }
        } else {
          reject(new Error(`Shopify API error: ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Shopify API request error: ${e.message}`));
    });

    req.end();
  });
}

// Dashboard endpoint with 3-tier system stats
router.get('/dashboard', async (req, res) => {
  try {
    console.log('📊 Loading dashboard with live Shopify data...');

    // Fetch data in parallel
    const [productsResponse, customCollectionsResponse, smartCollectionsResponse, customersResponse] = await Promise.all([
      makeShopifyRequest('products.json?limit=250'),
      makeShopifyRequest('custom_collections.json'),
      makeShopifyRequest('smart_collections.json'),
      makeShopifyRequest('customers.json?limit=250')
    ]);

    const products = productsResponse.products || [];
    const customCollections = customCollectionsResponse.custom_collections || [];
    const smartCollections = smartCollectionsResponse.smart_collections || [];
    const customers = customersResponse.customers || [];

    // Combine all collections
    const allCollections = [...customCollections, ...smartCollections];

    // Calculate customer access levels
    const verifiedCustomers = customers.filter(customer => 
      customer.tags && customer.tags.includes('verified')
    ).length;

    const butterflyPaidCustomers = customers.filter(customer => 
      customer.tags && customer.tags.includes('butterfly_paid')
    ).length;

    const totalCustomers = customers.length;

    // Calculate stats
    const stats = {
      totalProducts: products.length,
      totalCollections: allCollections.length,
      totalCustomers: totalCustomers,
      verifiedCustomers: verifiedCustomers,
      butterflyPaidCustomers: butterflyPaidCustomers,
      publicCustomers: totalCustomers - verifiedCustomers - butterflyPaidCustomers
    };

    // Default settings for 3-tier system
    const settings = {
      is_enabled: true,
      verified_tag: 'verified',
      butterfly_paid_tag: 'butterfly_paid',
      certification_url: 'https://maliaextensions.com/pages/certification',
      education_collections: 'courses,in-person-education-1',
      butterfly_collections: 'butterfly,flutter-luxe',
      pro_account_title: 'PRO ACCOUNT REQUIRED',
      pro_account_subtitle: 'MALIÁ PRODUCTS ARE AVAILABLE EXCLUSIVELY TO LICENSED HAIR STYLISTS.\n\nCREATE YOUR FREE PRO ACCOUNT TO ACCESS PROFESSIONAL PRICING, MALIA EDUCATION AND TO PLACE ORDERS.',
      pro_account_create_text: 'CREATE FREE PRO ACCOUNT',
      pro_account_login_text: 'LOGIN',
      pro_account_locate_text: 'LOCATE CERTIFIED MALIÁ STYLISTS NEAR YOU',
      butterfly_title: 'BUTTERFLY CERTIFICATION REQUIRED',
      butterfly_subtitle: 'THIS METHOD REQUIRES MALIÁ BUTTERFLY CERTIFICATION BEFORE PURCHASE.\n\nOUR TRAINING ENSURES YOU MASTER THE TECHNIQUE SAFELY AND EFFECTIVELY, PROTECTING BOTH YOU AND YOUR CLIENTS.',
      butterfly_button_text: 'EXPLORE CERTIFICATIONS OPTIONS'
    };

    // Mock analytics data
    const analytics = [
      { access_type: 'public_blocked', count: 145 },
      { access_type: 'verified_access', count: 89 },
      { access_type: 'butterfly_access', count: 34 }
    ];

    console.log('✅ Dashboard data loaded successfully:', {
      products: products.length,
      collections: allCollections.length,
      customers: totalCustomers,
      verified: verifiedCustomers,
      butterfly: butterflyPaidCustomers
    });

    res.json({
      success: true,
      stats,
      settings,
      analytics
    });

  } catch (error) {
    console.error('❌ Error fetching dashboard data:', error);
    res.status(500).json({ 
      error: 'Failed to load live Shopify data',
      details: error.message 
    });
  }
});

// Get all products
router.get('/products', async (req, res) => {
  try {
    console.log('📦 Loading products from Shopify...');
    
    const response = await makeShopifyRequest('products.json?limit=250');
    const products = response.products || [];

    // Add restriction status based on collection membership
    const processedProducts = products.map(product => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      product_type: product.product_type,
      vendor: product.vendor,
      created_at: product.created_at,
      updated_at: product.updated_at,
      status: product.status,
      // For now, mark all as restricted by default (can be customized later)
      isRestricted: true,
      accessLevel: 'verified' // Default access level
    }));

    console.log(`✅ Loaded ${products.length} products`);

    res.json({
      success: true,
      products: processedProducts
    });

  } catch (error) {
    console.error('❌ Error fetching products:', error);
    res.status(500).json({ 
      error: 'Failed to load products',
      details: error.message 
    });
  }
});

// Get all collections
router.get('/collections', async (req, res) => {
  try {
    console.log('📁 Loading collections from Shopify...');
    
    const [customResponse, smartResponse] = await Promise.all([
      makeShopifyRequest('custom_collections.json'),
      makeShopifyRequest('smart_collections.json')
    ]);

    const customCollections = customResponse.custom_collections || [];
    const smartCollections = smartResponse.smart_collections || [];
    
    // Combine and format collections
    const allCollections = [
      ...customCollections.map(c => ({
        id: c.id,
        title: c.title,
        handle: c.handle,
        type: 'custom',
        products_count: c.products_count || 0,
        created_at: c.created_at,
        updated_at: c.updated_at
      })),
      ...smartCollections.map(c => ({
        id: c.id,
        title: c.title,
        handle: c.handle,
        type: 'smart',
        products_count: c.products_count || 0,
        created_at: c.created_at,
        updated_at: c.updated_at
      }))
    ];

    console.log(`✅ Loaded ${allCollections.length} collections (${customCollections.length} custom, ${smartCollections.length} smart)`);

    res.json({
      success: true,
      collections: allCollections
    });

  } catch (error) {
    console.error('❌ Error fetching collections:', error);
    res.status(500).json({ 
      error: 'Failed to get collections',
      details: error.message 
    });
  }
});

// Get customers with access level analysis
router.get('/customers', async (req, res) => {
  try {
    console.log('👥 Loading customers from Shopify...');
    
    const response = await makeShopifyRequest('customers.json?limit=250');
    const customers = response.customers || [];

    // Analyze customer access levels
    const processedCustomers = customers.map(customer => {
      const tags = customer.tags ? customer.tags.split(',').map(tag => tag.trim()) : [];
      
      let accessLevel = 'public';
      if (tags.includes('butterfly_paid')) {
        accessLevel = 'butterfly';
      } else if (tags.includes('verified')) {
        accessLevel = 'verified';
      }

      return {
        id: customer.id,
        first_name: customer.first_name,
        last_name: customer.last_name,
        email: customer.email,
        phone: customer.phone,
        tags: tags,
        accessLevel: accessLevel,
        orders_count: customer.orders_count || 0,
        total_spent: customer.total_spent || '0.00',
        created_at: customer.created_at,
        updated_at: customer.updated_at
      };
    });

    console.log(`✅ Loaded ${customers.length} customers`);

    res.json({
      success: true,
      customers: processedCustomers
    });

  } catch (error) {
    console.error('❌ Error fetching customers:', error);
    res.status(500).json({ 
      error: 'Failed to load customers',
      details: error.message 
    });
  }
});

// Get analytics data
router.get('/analytics', async (req, res) => {
  try {
    // For now, return mock analytics data
    // In a real implementation, this would pull from access logs
    const analytics = [
      { access_type: 'public_blocked', count: 145 },
      { access_type: 'verified_access', count: 89 },
      { access_type: 'butterfly_access', count: 34 },
      { access_type: 'education_access', count: 67 }
    ];

    res.json({
      success: true,
      analytics
    });

  } catch (error) {
    console.error('❌ Error loading analytics:', error);
    res.status(500).json({ 
      error: 'Failed to load analytics',
      details: error.message 
    });
  }
});

// Save access control settings
router.put('/access-control', async (req, res) => {
  try {
    const settings = req.body;
    console.log('💾 Saving access control settings:', settings);

    // In a real implementation, save to database
    // For now, just return success
    
    res.json({
      success: true,
      message: 'Access control settings saved successfully'
    });

  } catch (error) {
    console.error('❌ Error saving access control:', error);
    res.status(500).json({ 
      error: 'Failed to save access control settings',
      details: error.message 
    });
  }
});

// Save message settings
router.put('/messages', async (req, res) => {
  try {
    const messages = req.body;
    console.log('💬 Saving message settings:', messages);

    // In a real implementation, save to database
    // For now, just return success
    
    res.json({
      success: true,
      message: 'Message settings saved successfully'
    });

  } catch (error) {
    console.error('❌ Error saving messages:', error);
    res.status(500).json({ 
      error: 'Failed to save message settings',
      details: error.message 
    });
  }
});

// Test Shopify connection
router.get('/test-shopify', async (req, res) => {
  try {
    console.log('🔍 Testing Shopify API connection...');
    
    const response = await makeShopifyRequest('shop.json');
    
    res.json({
      success: true,
      message: 'Shopify connection successful',
      shop: {
        name: response.shop.name,
        domain: response.shop.domain,
        email: response.shop.email,
        plan_name: response.shop.plan_name
      }
    });

  } catch (error) {
    console.error('❌ Shopify connection test failed:', error);
    res.status(500).json({ 
      error: 'Shopify connection failed',
      details: error.message 
    });
  }
});

module.exports = router;
