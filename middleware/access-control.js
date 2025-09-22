const ShopifyAPIClient = require('../lib/shopify-api');
const { AccessLogs } = require('../lib/database');

/**
 * Middleware to validate customer access to restricted products
 */
async function validateCustomerAccess(req, res, next) {
  try {
    const { productId, customerId } = req.params;
    const shopDomain = req.session?.shop || req.query.shop;
    
    if (!shopDomain) {
      return res.status(400).json({ error: 'Shop domain required' });
    }

    const shopifyClient = new ShopifyAPIClient(req.session);
    
    // Check if product is restricted
    const isRestricted = await shopifyClient.isProductRestricted(productId, shopDomain);
    
    if (!isRestricted) {
      // Product is not restricted, allow access
      req.accessResult = { hasAccess: true, reason: 'not_restricted' };
      return next();
    }

    // Product is restricted, check customer access
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

    req.accessResult = accessResult;
    next();
  } catch (error) {
    console.error('Access validation error:', error);
    res.status(500).json({ error: 'Access validation failed' });
  }
}

/**
 * Middleware to check if customer has butterfly_paid tag
 */
async function requireButterflyPaidTag(req, res, next) {
  try {
    const { customerId } = req.params;
    const shopDomain = req.session?.shop || req.query.shop;
    
    if (!customerId) {
      return res.status(401).json({ 
        error: 'Authentication required',
        reason: 'not_logged_in',
        message: 'Please log in to access this content'
      });
    }

    const shopifyClient = new ShopifyAPIClient(req.session);
    const accessResult = await shopifyClient.validateCustomerAccess(customerId);
    
    if (!accessResult.hasAccess) {
      return res.status(403).json({
        error: 'Pro access required',
        reason: accessResult.reason,
        message: accessResult.reason === 'no_tag' 
          ? 'Certification required to access this content'
          : 'Authentication required'
      });
    }

    req.customer = accessResult.customer;
    next();
  } catch (error) {
    console.error('Butterfly paid tag validation error:', error);
    res.status(500).json({ error: 'Access validation failed' });
  }
}

/**
 * Middleware to validate shop session
 */
function validateShopSession(req, res, next) {
  if (!req.session?.shop) {
    return res.status(401).json({ error: 'Shop session required' });
  }
  next();
}

/**
 * Middleware to check app installation status
 */
async function checkAppInstallation(req, res, next) {
  try {
    const shopDomain = req.session?.shop || req.query.shop;
    
    if (!shopDomain) {
      return res.status(400).json({ error: 'Shop domain required' });
    }

    const { AppSettings } = require('../lib/database');
    const settings = await AppSettings.get(shopDomain);
    
    if (!settings) {
      return res.status(404).json({ 
        error: 'App not installed',
        message: 'Please install the Malia Pro Access app first'
      });
    }

    req.appSettings = settings;
    next();
  } catch (error) {
    console.error('App installation check error:', error);
    res.status(500).json({ error: 'Installation check failed' });
  }
}

/**
 * Rate limiting middleware
 */
function createRateLimit(windowMs = 15 * 60 * 1000, max = 100) {
  const requests = new Map();
  
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;
    
    // Clean old entries
    for (const [ip, timestamps] of requests.entries()) {
      const validTimestamps = timestamps.filter(timestamp => timestamp > windowStart);
      if (validTimestamps.length === 0) {
        requests.delete(ip);
      } else {
        requests.set(ip, validTimestamps);
      }
    }
    
    // Check current request
    const userRequests = requests.get(key) || [];
    if (userRequests.length >= max) {
      return res.status(429).json({ 
        error: 'Too many requests',
        message: 'Please try again later'
      });
    }
    
    userRequests.push(now);
    requests.set(key, userRequests);
    next();
  };
}

module.exports = {
  validateCustomerAccess,
  requireButterflyPaidTag,
  validateShopSession,
  checkAppInstallation,
  createRateLimit
};


