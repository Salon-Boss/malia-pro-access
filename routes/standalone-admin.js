const express = require("express");
const router = express.Router();

router.get("/dashboard", async (req, res) => {
  try {
    const mockStats = {
      totalProducts: 150,
      restrictedProducts: 120,
      totalCollections: 25,
      exceptionCollections: 5
    };

    const mockAnalytics = [
      { access_type: "denied_not_logged_in", count: 45 },
      { access_type: "denied_no_pro_tag", count: 23 },
      { access_type: "allowed_pro_access", count: 78 }
    ];

    const settings = {
      is_enabled: true,
      butterfly_paid_tag: "butterfly_paid",
      certification_url: "https://maliaextensions.com/pages/certification",
      education_collections: "courses,in-person-education-1",
      pro_account_message: "PRO ACCOUNT REQUIRED",
      certification_message: "CERTIFICATION REQUIRED",
      pro_account_description: "MALIÁ PRODUCTS ARE AVAILABLE EXCLUSIVELY TO LICENSED HAIR STYLISTS.",
      certification_description: "GET CERTIFIED TO ACCESS PROFESSIONAL PRICING AND PLACE ORDERS."
    };

    res.json({
      success: true,
      stats: mockStats,
      settings: settings,
      analytics: mockAnalytics
    });
  } catch (error) {
    console.error("Dashboard error:", error);
    res.status(500).json({ error: "Failed to load dashboard data" });
  }
});

router.get("/products", async (req, res) => {
  try {
    const mockProducts = [
      {
        id: 1,
        title: "Professional Hair Color - Blonde",
        handle: "pro-hair-color-blonde",
        product_type: "Hair Color",
        isRestricted: true
      },
      {
        id: 2,
        title: "Professional Hair Color - Brown", 
        handle: "pro-hair-color-brown",
        product_type: "Hair Color",
        isRestricted: true
      }
    ];

    res.json({ success: true, products: mockProducts });
  } catch (error) {
    res.status(500).json({ error: "Failed to get products" });
  }
});

router.get("/collections", async (req, res) => {
  try {
    const mockCollections = [
      {
        id: 1,
        title: "Professional Hair Colors",
        handle: "professional-hair-colors",
        isException: false
      },
      {
        id: 2,
        title: "Online Education",
        handle: "online-education", 
        isException: true
      }
    ];

    res.json({ success: true, collections: mockCollections });
  } catch (error) {
    res.status(500).json({ error: "Failed to get collections" });
  }
});

module.exports = router;
