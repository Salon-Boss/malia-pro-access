const request = require('supertest');
const app = require('../server');
const { setupDatabase, db } = require('../lib/database');

describe('Malia Pro Access API', () => {
  beforeAll(async () => {
    await setupDatabase();
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    // Clean up test data
    await db('app_settings').del();
    await db('product_restrictions').del();
    await db('collection_exceptions').del();
    await db('access_logs').del();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'healthy');
      expect(response.body).toHaveProperty('timestamp');
    });
  });

  describe('GET /api/auth/status', () => {
    it('should return not installed status for new shop', async () => {
      const response = await request(app)
        .get('/api/auth/status?shop=test-shop.myshopify.com')
        .expect(200);

      expect(response.body).toHaveProperty('installed', false);
      expect(response.body).toHaveProperty('shopDomain', 'test-shop.myshopify.com');
      expect(response.body.settings).toBeNull();
    });
  });

  describe('GET /api/auth/install', () => {
    it('should install app with default settings', async () => {
      const response = await request(app)
        .get('/api/auth/install?shop=test-shop.myshopify.com')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'App installed successfully');
      expect(response.body.settings).toHaveProperty('butterfly_paid_tag', 'butterfly_paid');
      expect(response.body.settings).toHaveProperty('certification_url', 'https://maliaextensions.com/pages/certification');
    });

    it('should return already installed for existing shop', async () => {
      // First installation
      await request(app)
        .get('/api/auth/install?shop=test-shop.myshopify.com')
        .expect(200);

      // Second installation attempt
      const response = await request(app)
        .get('/api/auth/install?shop=test-shop.myshopify.com')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message', 'App already installed');
    });
  });

  describe('PUT /api/admin/settings', () => {
    beforeEach(async () => {
      // Install app first
      await request(app)
        .get('/api/auth/install?shop=test-shop.myshopify.com');
    });

    it('should update app settings', async () => {
      const newSettings = {
        is_enabled: false,
        butterfly_paid_tag: 'custom_tag',
        certification_url: 'https://example.com/certification',
        education_collections: 'custom-collection',
        pro_account_message: 'CUSTOM PRO MESSAGE',
        certification_message: 'CUSTOM CERT MESSAGE'
      };

      const response = await request(app)
        .put('/api/admin/settings')
        .set('Cookie', 'shop=test-shop.myshopify.com')
        .send(newSettings)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.settings).toMatchObject(newSettings);
    });
  });

  describe('GET /api/admin/products', () => {
    beforeEach(async () => {
      // Install app first
      await request(app)
        .get('/api/auth/install?shop=test-shop.myshopify.com');
    });

    it('should return products with restriction status', async () => {
      const response = await request(app)
        .get('/api/admin/products')
        .set('Cookie', 'shop=test-shop.myshopify.com')
        .expect(200);

      expect(response.body).toHaveProperty('products');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.products)).toBe(true);
    });
  });

  describe('PUT /api/admin/products/:productId/restriction', () => {
    beforeEach(async () => {
      // Install app first
      await request(app)
        .get('/api/auth/install?shop=test-shop.myshopify.com');
    });

    it('should update product restriction status', async () => {
      const productId = 12345;
      const restrictionData = {
        isRestricted: false,
        customMessage: 'This product is now unrestricted'
      };

      const response = await request(app)
        .put(`/api/admin/products/${productId}/restriction`)
        .set('Cookie', 'shop=test-shop.myshopify.com')
        .send(restrictionData)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.product).toHaveProperty('id', productId);
      expect(response.body.product).toHaveProperty('isRestricted', false);
    });
  });

  describe('GET /api/check-access/:productId/:customerId', () => {
    beforeEach(async () => {
      // Install app first
      await request(app)
        .get('/api/auth/install?shop=test-shop.myshopify.com');
    });

    it('should return access denied for non-logged-in customer', async () => {
      const response = await request(app)
        .get('/api/check-access/12345/null')
        .set('Cookie', 'shop=test-shop.myshopify.com')
        .expect(200);

      expect(response.body).toHaveProperty('hasAccess', false);
      expect(response.body).toHaveProperty('reason', 'not_logged_in');
    });

    it('should return access denied for customer without butterfly_paid tag', async () => {
      const response = await request(app)
        .get('/api/check-access/12345/67890')
        .set('Cookie', 'shop=test-shop.myshopify.com')
        .expect(200);

      expect(response.body).toHaveProperty('hasAccess', false);
      expect(response.body).toHaveProperty('reason', 'no_tag');
    });
  });

  describe('POST /api/validate-cart', () => {
    beforeEach(async () => {
      // Install app first
      await request(app)
        .get('/api/auth/install?shop=test-shop.myshopify.com');
    });

    it('should validate cart items', async () => {
      const cartData = {
        cartItems: [
          {
            product_id: 12345,
            variant_id: 67890,
            quantity: 1
          }
        ],
        customerId: null
      };

      const response = await request(app)
        .post('/api/validate-cart')
        .set('Cookie', 'shop=test-shop.myshopify.com')
        .send(cartData)
        .expect(200);

      expect(response.body).toHaveProperty('valid');
      expect(response.body).toHaveProperty('customerAccess');
      expect(response.body).toHaveProperty('items');
      expect(Array.isArray(response.body.items)).toBe(true);
    });
  });

  describe('Error handling', () => {
    it('should return 404 for non-existent routes', async () => {
      await request(app)
        .get('/api/non-existent-route')
        .expect(404);
    });

    it('should return 400 for missing shop domain', async () => {
      await request(app)
        .get('/api/auth/status')
        .expect(400);
    });
  });
});


