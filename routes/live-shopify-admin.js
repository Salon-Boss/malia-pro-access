const express = require("express");
const router = express.Router();

/**
 * Live Shopify API Client for connecting to store
 */
class LiveShopifyClient {
  constructor() {
    this.storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
    this.accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    
    if (!this.storeDomain || !this.accessToken) {
      throw new Error("Missing Shopify credentials in environment variables");
    }
    
    this.baseUrl = `https://${this.storeDomain}/admin/api/2023-10`;
  }

  async makeRequest(endpoint) {
    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        headers: {
          "X-Shopify-Access-Token": this.accessToken,
          "Content-Type": "application/json"
        }
      });
      
      if (!response.ok) {
        throw new Error(`Shopify API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error("Shopify API request failed:", error);
      throw error;
    }
  }

  async getProducts() {
    return await this.makeRequest("/products.json?limit=250");
  }

  async getCollections() {
    return await this.makeRequest("/collections.json?limit=250");
  }

  async getCustomers() {
    return await this.makeRequest("/customers.json?limit=250");
  }

  async getOrders() {
    return await this.makeRequest("/orders.json?limit=250&status=any");
  }
}

/**
 * GET /api/admin/dashboard
 * Get live dashboard data from Shopify store
 */
router.get("/dashboard", async (req, res) => {
  try {
    console.log("Loading live Shopify data...");
    const shopify = new LiveShopifyClient();
    
    // Fetch live data from Shopify
    const [productsData, collectionsData, customersData, ordersData] = await Promise.all([
      shopify.getProducts(),
      shopify.getCollections(), 
      shopify.getCustomers(),
      shopify.getOrders()
    ]);

    const products = productsData.products || [];
    const collections = collectionsData.collections || [];
    const customers = customersData.customers || [];
    const orders = ordersData.orders || [];

    // Calculate real stats
    const stats = {
      totalProducts: products.length,
      totalCollections: collections.length,
      totalCustomers: customers.length,
      totalOrders: orders.length,
      verifiedCustomers: customers.filter(c => c.tags?.includes("verified")).length,
      butterflyPaidCustomers: customers.filter(c => c.tags?.includes("butterfly_paid")).length
    };

    // Analyze customer access levels
    const customerAnalytics = {
      noAccess: customers.filter(c => !c.tags?.includes("verified") && !c.tags?.includes("butterfly_paid")).length,
      verifiedOnly: customers.filter(c => c.tags?.includes("verified") && !c.tags?.includes("butterfly_paid")).length,
      butterflyPaid: customers.filter(c => c.tags?.includes("butterfly_paid")).length
    };

    // Default settings for 3-tier access
    const settings = {
      is_enabled: true,
      verified_tag: "verified",
      butterfly_paid_tag: "butterfly_paid",
      certification_url: "https://maliaextensions.com/pages/certification",
      
      // Messages for 3 different access levels
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
      analytics: customerAnalytics,
      live_data: {
        products_sample: products.slice(0, 5).map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          tags: p.tags
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
    const shopify = new LiveShopifyClient();
    const data = await shopify.getProducts();
    const products = data.products || [];

    const formattedProducts = products.map(product => ({
      id: product.id,
      title: product.title,
      handle: product.handle,
      product_type: product.product_type,
      tags: product.tags,
      status: product.status,
      created_at: product.created_at,
      // Determine access level based on tags or collections
      access_level: getProductAccessLevel(product)
    }));

    res.json({ success: true, products: formattedProducts });
  } catch (error) {
    console.error("Products error:", error);
    res.status(500).json({ error: "Failed to get products" });
  }
});

/**
 * GET /api/admin/collections
 * Get live collections from Shopify
 */
router.get("/collections", async (req, res) => {
  try {
    const shopify = new LiveShopifyClient();
    const data = await shopify.getCollections();
    const collections = data.collections || [];

    const formattedCollections = collections.map(collection => ({
      id: collection.id,
      title: collection.title,
      handle: collection.handle,
      products_count: collection.products_count,
      // Determine if this is an education, butterfly, or general collection
      access_level: getCollectionAccessLevel(collection)
    }));

    res.json({ success: true, collections: formattedCollections });
  } catch (error) {
    console.error("Collections error:", error);
    res.status(500).json({ error: "Failed to get collections" });
  }
});

/**
 * GET /api/admin/customers
 * Get customer analytics (tags distribution)
 */
router.get("/customers", async (req, res) => {
  try {
    const shopify = new LiveShopifyClient();
    const data = await shopify.getCustomers();
    const customers = data.customers || [];

    const analytics = {
      total: customers.length,
      no_access: customers.filter(c => !c.tags?.includes("verified") && !c.tags?.includes("butterfly_paid")).length,
      verified_only: customers.filter(c => c.tags?.includes("verified") && !c.tags?.includes("butterfly_paid")).length,
      butterfly_paid: customers.filter(c => c.tags?.includes("butterfly_paid")).length,
      
      // Sample customers for each category (for debugging)
      samples: {
        no_access: customers.filter(c => !c.tags?.includes("verified") && !c.tags?.includes("butterfly_paid")).slice(0, 3).map(c => ({
          id: c.id,
          email: c.email,
          tags: c.tags
        })),
        verified: customers.filter(c => c.tags?.includes("verified")).slice(0, 3).map(c => ({
          id: c.id,
          email: c.email,
          tags: c.tags
        })),
        butterfly_paid: customers.filter(c => c.tags?.includes("butterfly_paid")).slice(0, 3).map(c => ({
          id: c.id,
          email: c.email,
          tags: c.tags
        }))
      }
    };

    res.json({ success: true, customers: analytics });
  } catch (error) {
    console.error("Customers error:", error);
    res.status(500).json({ error: "Failed to get customers" });
  }
});

// Helper functions
function getProductAccessLevel(product) {
  const tags = product.tags || "";
  
  if (tags.includes("education") || tags.includes("course")) {
    return "none"; // Everyone can buy
  } else if (tags.includes("butterfly") || tags.includes("flutter")) {
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
