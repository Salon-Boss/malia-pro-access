const { setupDatabase, AppSettings, ProductRestrictions, CollectionExceptions, AccessLogs, db } = require('../lib/database');

describe('Database Operations', () => {
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

  describe('AppSettings', () => {
    it('should create new app settings', async () => {
      const shopDomain = 'test-shop.myshopify.com';
      const settings = {
        is_enabled: true,
        butterfly_paid_tag: 'butterfly_paid',
        certification_url: 'https://maliaextensions.com/pages/certification'
      };

      await AppSettings.createOrUpdate(shopDomain, settings);
      const result = await AppSettings.get(shopDomain);

      expect(result).toMatchObject({
        shop_domain: shopDomain,
        ...settings
      });
    });

    it('should update existing app settings', async () => {
      const shopDomain = 'test-shop.myshopify.com';
      const initialSettings = {
        is_enabled: true,
        butterfly_paid_tag: 'butterfly_paid'
      };

      // Create initial settings
      await AppSettings.createOrUpdate(shopDomain, initialSettings);

      // Update settings
      const updatedSettings = {
        is_enabled: false,
        butterfly_paid_tag: 'custom_tag'
      };

      await AppSettings.createOrUpdate(shopDomain, updatedSettings);
      const result = await AppSettings.get(shopDomain);

      expect(result).toMatchObject({
        shop_domain: shopDomain,
        ...updatedSettings
      });
    });

    it('should return null for non-existent shop', async () => {
      const result = await AppSettings.get('non-existent-shop.myshopify.com');
      expect(result).toBeUndefined();
    });
  });

  describe('ProductRestrictions', () => {
    it('should set product restriction', async () => {
      const shopDomain = 'test-shop.myshopify.com';
      const productId = 12345;
      const productHandle = 'test-product';

      await ProductRestrictions.setRestriction(shopDomain, productId, productHandle, true, 'Custom message');
      const result = await ProductRestrictions.getByProduct(shopDomain, productId);

      expect(result).toMatchObject({
        shop_domain: shopDomain,
        product_id: productId,
        product_handle: productHandle,
        is_restricted: true,
        custom_message: 'Custom message'
      });
    });

    it('should update existing product restriction', async () => {
      const shopDomain = 'test-shop.myshopify.com';
      const productId = 12345;
      const productHandle = 'test-product';

      // Set initial restriction
      await ProductRestrictions.setRestriction(shopDomain, productId, productHandle, true, 'Initial message');

      // Update restriction
      await ProductRestrictions.setRestriction(shopDomain, productId, productHandle, false, 'Updated message');
      const result = await ProductRestrictions.getByProduct(shopDomain, productId);

      expect(result).toMatchObject({
        is_restricted: false,
        custom_message: 'Updated message'
      });
    });

    it('should get all product restrictions for shop', async () => {
      const shopDomain = 'test-shop.myshopify.com';

      // Create multiple restrictions
      await ProductRestrictions.setRestriction(shopDomain, 1, 'product-1', true);
      await ProductRestrictions.setRestriction(shopDomain, 2, 'product-2', false);

      const results = await ProductRestrictions.getAll(shopDomain);
      expect(results).toHaveLength(2);
    });

    it('should bulk set product restrictions', async () => {
      const shopDomain = 'test-shop.myshopify.com';
      const restrictions = [
        { product_id: 1, product_handle: 'product-1', is_restricted: true, custom_message: null },
        { product_id: 2, product_handle: 'product-2', is_restricted: false, custom_message: 'Unrestricted' }
      ];

      await ProductRestrictions.bulkSetRestrictions(shopDomain, restrictions);
      const results = await ProductRestrictions.getAll(shopDomain);

      expect(results).toHaveLength(2);
      expect(results[0].is_restricted).toBe(true);
      expect(results[1].is_restricted).toBe(false);
    });
  });

  describe('CollectionExceptions', () => {
    it('should set collection exception', async () => {
      const shopDomain = 'test-shop.myshopify.com';
      const collectionId = 12345;
      const collectionHandle = 'test-collection';

      await CollectionExceptions.setException(shopDomain, collectionId, collectionHandle, true);
      const result = await CollectionExceptions.getByCollection(shopDomain, collectionId);

      expect(result).toMatchObject({
        shop_domain: shopDomain,
        collection_id: collectionId,
        collection_handle: collectionHandle,
        is_exception: true
      });
    });

    it('should update existing collection exception', async () => {
      const shopDomain = 'test-shop.myshopify.com';
      const collectionId = 12345;
      const collectionHandle = 'test-collection';

      // Set initial exception
      await CollectionExceptions.setException(shopDomain, collectionId, collectionHandle, true);

      // Update exception
      await CollectionExceptions.setException(shopDomain, collectionId, collectionHandle, false);
      const result = await CollectionExceptions.getByCollection(shopDomain, collectionId);

      expect(result.is_exception).toBe(false);
    });

    it('should get all collection exceptions for shop', async () => {
      const shopDomain = 'test-shop.myshopify.com';

      // Create multiple exceptions
      await CollectionExceptions.setException(shopDomain, 1, 'collection-1', true);
      await CollectionExceptions.setException(shopDomain, 2, 'collection-2', false);

      const results = await CollectionExceptions.getAll(shopDomain);
      expect(results).toHaveLength(2);
    });
  });

  describe('AccessLogs', () => {
    it('should log access attempt', async () => {
      const shopDomain = 'test-shop.myshopify.com';
      const productId = 12345;
      const customerId = 67890;
      const accessType = 'blocked_not_logged_in';
      const ipAddress = '192.168.1.1';
      const userAgent = 'Mozilla/5.0...';

      await AccessLogs.log(shopDomain, productId, customerId, accessType, ipAddress, userAgent);
      
      // Verify log was created (we can't easily query without adding a get method)
      const logs = await db('access_logs').where('shop_domain', shopDomain);
      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        shop_domain: shopDomain,
        product_id: productId,
        customer_id: customerId,
        access_type: accessType,
        ip_address: ipAddress,
        user_agent: userAgent
      });
    });

    it('should get analytics for shop', async () => {
      const shopDomain = 'test-shop.myshopify.com';

      // Create multiple log entries
      await AccessLogs.log(shopDomain, 1, 1, 'allowed', '192.168.1.1', 'User Agent 1');
      await AccessLogs.log(shopDomain, 2, 2, 'blocked_not_logged_in', '192.168.1.2', 'User Agent 2');
      await AccessLogs.log(shopDomain, 3, 3, 'blocked_no_tag', '192.168.1.3', 'User Agent 3');

      const analytics = await AccessLogs.getAnalytics(shopDomain, 30);
      
      expect(analytics).toHaveLength(3);
      
      const allowedCount = analytics.find(a => a.access_type === 'allowed')?.count;
      const blockedNotLoggedInCount = analytics.find(a => a.access_type === 'blocked_not_logged_in')?.count;
      const blockedNoTagCount = analytics.find(a => a.access_type === 'blocked_no_tag')?.count;

      expect(allowedCount).toBe('1');
      expect(blockedNotLoggedInCount).toBe('1');
      expect(blockedNoTagCount).toBe('1');
    });
  });

  describe('Database constraints', () => {
    it('should enforce unique constraint on app_settings', async () => {
      const shopDomain = 'test-shop.myshopify.com';
      const settings = { is_enabled: true };

      // First insert should succeed
      await AppSettings.createOrUpdate(shopDomain, settings);

      // Second insert should update, not create duplicate
      await AppSettings.createOrUpdate(shopDomain, { is_enabled: false });
      
      const results = await db('app_settings').where('shop_domain', shopDomain);
      expect(results).toHaveLength(1);
      expect(results[0].is_enabled).toBe(false);
    });

    it('should enforce unique constraint on product_restrictions', async () => {
      const shopDomain = 'test-shop.myshopify.com';
      const productId = 12345;
      const productHandle = 'test-product';

      // First insert
      await ProductRestrictions.setRestriction(shopDomain, productId, productHandle, true);

      // Second insert should update, not create duplicate
      await ProductRestrictions.setRestriction(shopDomain, productId, productHandle, false);

      const results = await db('product_restrictions').where({
        shop_domain: shopDomain,
        product_id: productId
      });
      
      expect(results).toHaveLength(1);
      expect(results[0].is_restricted).toBe(false);
    });
  });
});


