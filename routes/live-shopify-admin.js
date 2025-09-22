const express = require("express");
const https = require("https");
const router = express.Router();

/**
 * Helper function to make Shopify API requests
 */
async function makeShopifyRequest(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: process.env.SHOPIFY_STORE_DOMAIN,
      path: `/admin/api/2023-10${endpoint}`,
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": process.env.SHOPIFY_ACCESS_TOKEN,
        "Content-Type": "application/json"
      }
    };

    const req = https.request(options, (response) => {
      let data = "";
      
      response.on("data", (chunk) => {
        data += chunk;
      });
      
      response.on("end", () => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error(`JSON parse error: ${error.message}`));
          }
        } else {
          reject(new Error(`HTTP ${response.statusCode}: ${data}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
}

/**
 * GET /api/admin/test-shopify
 * Simple test endpoint to debug Shopify connection
 */
router.get("/test-shopify", async (req, res) => {
  try {
    const data = await makeShopifyRequest("/shop.json");
    res.json({
      success: true,
      message: "Shopify connection working!",
      shop_name: data.shop?.name,
      shop_domain: data.shop?.myshopify_domain,
      environment: {
        storeDomain: process.env.SHOPIFY_STORE_DOMAIN,
        hasToken: !!process.env.SHOPIFY_ACCESS_TOKEN
      }
    });
  } catch (error) {
    res.status(500).json({
      error: "Shopify test failed",
      message: error.message
    });
  }
});

/**
 * GET /api/admin/dashboard
 * Get live dashboard data from Shopify store
 */
router.get("/dashboard", async (req, res) => {
  try {
    // Get products and collections data
    const [productsData, collectionsData] = await Promise.all([
      makeShopifyRequest("/products.json?limit=250"),
      makeShopifyRequest("/collections.json?limit=250")
    ]);

    const products = productsData.products || [];
    const collections = collectionsData.collections || [];
    
    // Calculate real stats
    const stats = {
      totalProducts: products.length,
      totalCollections: collections.length,
      totalCustomers: 150, // Mock for now
      totalOrders: 500, // Mock for now
      verifiedCustomers: 75,
      butterflyPaidCustomers: 45
    };

    const settings = {
      is_enabled: true,
      verified_tag: "verified",
      butterfly_paid_tag: "butterfly_paid",
      certification_url: "https://maliaextensions.com/pages/certification",
      not_logged_in_message: "CREATE PRO ACCOUNT REQUIRED",
      not_logged_in_description: "MALIÁ PRODUCTS ARE AVAILABLE EXCLUSIVELY TO LICENSED HAIR STYLISTS.",
      verified_message: "BUTTERFLY ACCESS REQUIRED", 
      verified_description: "UPGRADE TO BUTTERFLY ACCESS TO PURCHASE THESE PREMIUM PRODUCTS.",
      general_access_message: "PROFESSIONAL ACCESS REQUIRED",
      general_access_description: "GET VERIFIED TO ACCESS PROFESSIONAL PRICING AND PLACE ORDERS."
    };

    res.json({
      success: true,
      stats: stats,
      settings: settings,
      analytics: {
        noAccess: 30,
        verifiedOnly: 75,
        butterflyPaid: 45
      },
      live_data: {
        products_sample: products.slice(0, 5).map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          tags: p.tags,
          product_type: p.product_type
        })),
        collections_sample: collections.slice(0, 10).map(c => ({
          id: c.id,
          title: c.title,
          handle: c.handle
        }))
      }
    });

  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ 
      error: "Failed to load live Shopify data",
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/products
 * Get live products from Shopify
 */
router.get("/products", async (req, res) => {
  try {
    const data = await makeShopifyRequest("/products.json?limit=250");
    const products = data.products || [];

    const formattedProducts = products.map(product => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      product_type: product.product_type,
      tags: product.tags,
      status: product.status,
      created_at: product.created_at,
      access_level: getProductAccessLevel(product)
    }));

    res.json({ success: true, products: formattedProducts });
  } catch (error) {
    console.error("Products error:", error);
    res.status(500).json({ 
      error: "Failed to get products",
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/collections
 * Get live collections from Shopify
 */
router.get("/collections", async (req, res) => {
  try {
    const data = await makeShopifyRequest("/collections.json?limit=250");
    const collections = data.collections || [];

    const formattedCollections = collections.map(collection => ({
      id: collection.id,
      title: collection.title,
      handle: collection.handle,
      products_count: collection.products_count,
      access_level: getCollectionAccessLevel(collection)
    }));

    res.json({ success: true, collections: formattedCollections });
  } catch (error) {
    console.error("Collections error:", error);
    res.status(500).json({ 
      error: "Failed to get collections",
      message: error.message 
    });
  }
});

/**
 * GET /api/admin/customers
 * Get customer analytics (mock for now)
 */
router.get("/customers", async (req, res) => {
  try {
    // Mock customer data for now since we dont need to modify customers
    const analytics = {
      total: 150,
      no_access: 30,
      verified_only: 75,
      butterfly_paid: 45,
      samples: {
        no_access: [],
        verified: [],
        butterfly_paid: []
      }
    };

    res.json({ success: true, customers: analytics });
  } catch (error) {
    res.status(500).json({ 
      error: "Failed to get customers",
      message: error.message 
    });
  }
});

// Helper functions
function getProductAccessLevel(product) {
  const tags = product.tags || "";
  const title = product.title.toLowerCase();
  
  if (tags.includes("education") || tags.includes("course") || title.includes("education") || title.includes("course")) {
    return "none"; // Everyone can buy
  } else if (tags.includes("butterfly") || tags.includes("flutter") || title.includes("butterfly") || title.includes("flutter")) {
    return "butterfly_paid"; // Requires butterfly_paid tag
  } else {
    return "verified"; // Requires verified tag
  }
}

function getCollectionAccessLevel(collection) {
  const handle = collection.handle.toLowerCase();
  const title = collection.title.toLowerCase();
  
  if (handle.includes("education") || handle.includes("course") || title.includes("education")) {
    return "none";
  } else if (handle.includes("butterfly") || handle.includes("flutter") || title.includes("butterfly") || title.includes("flutter")) {
    return "butterfly_paid";
  } else {
    return "verified";
  }
}

module.exports = router;
