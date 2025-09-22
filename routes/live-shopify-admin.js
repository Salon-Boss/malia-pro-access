const express = require("express");
const https = require("https");
const router = express.Router();

/**
 * GET /api/admin/test-shopify
 * Simple test endpoint to debug Shopify connection
 */
router.get("/test-shopify", async (req, res) => {
  try {
    const storeDomain = process.env.SHOPIFY_STORE_DOMAIN;
    const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
    
    console.log("Environment check:");
    console.log("Store Domain:", storeDomain);
    console.log("Access Token:", accessToken ? `${accessToken.substring(0, 10)}...` : "NOT SET");
    
    if (!storeDomain || !accessToken) {
      return res.status(500).json({
        error: "Missing credentials",
        storeDomain: !!storeDomain,
        accessToken: !!accessToken
      });
    }

    // Test simple shop endpoint first
    const options = {
      hostname: storeDomain,
      path: "/admin/api/2023-10/shop.json",
      method: "GET",
      headers: {
        "X-Shopify-Access-Token": accessToken,
        "Content-Type": "application/json"
      }
    };

    console.log(`Testing: https://${options.hostname}${options.path}`);

    const data = await new Promise((resolve, reject) => {
      const req = https.request(options, (response) => {
        let data = "";
        
        response.on("data", (chunk) => {
          data += chunk;
        });
        
        response.on("end", () => {
          console.log(`Response status: ${response.statusCode}`);
          console.log(`Response headers:`, response.headers);
          
          if (response.statusCode >= 200 && response.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch (error) {
              reject(new Error(`JSON parse error: ${error.message}`));
            }
          } else {
            console.log(`Error response body:`, data);
            reject(new Error(`HTTP ${response.statusCode}: ${data}`));
          }
        });
      });

      req.on("error", (error) => {
        console.error("Request error:", error);
        reject(error);
      });

      req.end();
    });

    res.json({
      success: true,
      message: "Shopify connection working!",
      shop_name: data.shop?.name,
      shop_domain: data.shop?.myshopify_domain,
      environment: {
        storeDomain,
        hasToken: !!accessToken
      }
    });

  } catch (error) {
    console.error("Test error:", error);
    res.status(500).json({
      error: "Shopify test failed",
      message: error.message,
      environment: {
        storeDomain: process.env.SHOPIFY_STORE_DOMAIN,
        hasToken: !!process.env.SHOPIFY_ACCESS_TOKEN
      }
    });
  }
});

/**
 * GET /api/admin/dashboard
 * Get live dashboard data from Shopify store
 */
router.get("/dashboard", async (req, res) => {
  try {
    // First test the connection
    const testResult = await new Promise((resolve, reject) => {
      const options = {
        hostname: process.env.SHOPIFY_STORE_DOMAIN,
        path: "/admin/api/2023-10/products.json?limit=5",
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

    const products = testResult.products || [];
    
    // Mock stats for now using the real product count
    const stats = {
      totalProducts: products.length,
      totalCollections: 10, // Mock for now
      totalCustomers: 50, // Mock for now
      totalOrders: 100, // Mock for now
      verifiedCustomers: 25,
      butterflyPaidCustomers: 15
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
        noAccess: 10,
        verifiedOnly: 25,
        butterflyPaid: 15
      },
      live_data: {
        products_sample: products.map(p => ({
          id: p.id,
          title: p.title,
          handle: p.handle,
          tags: p.tags,
          product_type: p.product_type
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

module.exports = router;
