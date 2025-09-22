const knex = require('knex');

// Database configuration for production (PostgreSQL) and development (SQLite)
const dbConfig = process.env.DATABASE_URL ? {
  client: 'pg',
  connection: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
} : {
  client: 'sqlite3',
  connection: {
    filename: require('path').join(__dirname, '../database.sqlite')
  },
  useNullAsDefault: true
};

const db = knex(dbConfig);

async function setupDatabase() {
  try {
    // Create app settings table
    await db.schema.createTableIfNotExists('app_settings', (table) => {
      table.increments('id').primary();
      table.string('shop_domain').unique().notNullable();
      table.boolean('is_enabled').defaultTo(true);
      table.string('butterfly_paid_tag').defaultTo('butterfly_paid');
      table.text('certification_url').defaultTo('https://maliaextensions.com/pages/certification');
      table.text('education_collections').defaultTo('courses,in-person-education-1');
      table.text('pro_account_message').defaultTo('PRO ACCOUNT REQUIRED');
      table.text('certification_message').defaultTo('CERTIFICATION REQUIRED');
      table.text('pro_account_description').defaultTo('MALIÁ PRODUCTS ARE AVAILABLE EXCLUSIVELY TO LICENSED HAIR STYLISTS.');
      table.text('certification_description').defaultTo('GET CERTIFIED TO ACCESS PROFESSIONAL PRICING AND PLACE ORDERS.');
      table.timestamps(true, true);
    });

    // Create product restrictions table
    await db.schema.createTableIfNotExists('product_restrictions', (table) => {
      table.increments('id').primary();
      table.string('shop_domain').notNullable();
      table.bigInteger('product_id').notNullable();
      table.string('product_handle').notNullable();
      table.boolean('is_restricted').defaultTo(true);
      table.text('custom_message').nullable();
      table.timestamps(true, true);
      table.unique(['shop_domain', 'product_id']);
    });

    // Create collection exceptions table
    await db.schema.createTableIfNotExists('collection_exceptions', (table) => {
      table.increments('id').primary();
      table.string('shop_domain').notNullable();
      table.bigInteger('collection_id').notNullable();
      table.string('collection_handle').notNullable();
      table.boolean('is_exception').defaultTo(true);
      table.timestamps(true, true);
      table.unique(['shop_domain', 'collection_id']);
    });

    // Create access logs table for analytics
    await db.schema.createTableIfNotExists('access_logs', (table) => {
      table.increments('id').primary();
      table.string('shop_domain').notNullable();
      table.bigInteger('product_id').nullable();
      table.bigInteger('customer_id').nullable();
      table.string('access_type').notNullable(); // 'allowed', 'blocked_not_logged_in', 'blocked_no_tag'
      table.string('ip_address').nullable();
      table.string('user_agent').nullable();
      table.timestamps(true, true);
    });

    console.log('Database tables created successfully');
  } catch (error) {
    console.error('Database setup error:', error);
    throw error;
  }
}

// Helper functions for database operations
const AppSettings = {
  async get(shopDomain) {
    return await db('app_settings').where('shop_domain', shopDomain).first();
  },

  async createOrUpdate(shopDomain, settings) {
    const existing = await this.get(shopDomain);
    if (existing) {
      return await db('app_settings').where('shop_domain', shopDomain).update(settings);
    } else {
      return await db('app_settings').insert({ shop_domain: shopDomain, ...settings });
    }
  }
};

const ProductRestrictions = {
  async getByProduct(shopDomain, productId) {
    return await db('product_restrictions').where({ shop_domain: shopDomain, product_id: productId }).first();
  },

  async getAll(shopDomain) {
    return await db('product_restrictions').where('shop_domain', shopDomain);
  },

  async setRestriction(shopDomain, productId, productHandle, isRestricted, customMessage = null) {
    const existing = await this.getByProduct(shopDomain, productId);
    if (existing) {
      return await db('product_restrictions')
        .where({ shop_domain: shopDomain, product_id: productId })
        .update({ is_restricted: isRestricted, custom_message: customMessage });
    } else {
      return await db('product_restrictions').insert({
        shop_domain: shopDomain,
        product_id: productId,
        product_handle: productHandle,
        is_restricted: isRestricted,
        custom_message: customMessage
      });
    }
  },

  async bulkSetRestrictions(shopDomain, restrictions) {
    const promises = restrictions.map(restriction => 
      this.setRestriction(shopDomain, restriction.product_id, restriction.product_handle, restriction.is_restricted, restriction.custom_message)
    );
    return await Promise.all(promises);
  }
};

const CollectionExceptions = {
  async getByCollection(shopDomain, collectionId) {
    return await db('collection_exceptions').where({ shop_domain: shopDomain, collection_id: collectionId }).first();
  },

  async getAll(shopDomain) {
    return await db('collection_exceptions').where('shop_domain', shopDomain);
  },

  async setException(shopDomain, collectionId, collectionHandle, isException) {
    const existing = await this.getByCollection(shopDomain, collectionId);
    if (existing) {
      return await db('collection_exceptions')
        .where({ shop_domain: shopDomain, collection_id: collectionId })
        .update({ is_exception: isException });
    } else {
      return await db('collection_exceptions').insert({
        shop_domain: shopDomain,
        collection_id: collectionId,
        collection_handle: collectionHandle,
        is_exception: isException
      });
    }
  }
};

const AccessLogs = {
  async log(shopDomain, productId, customerId, accessType, ipAddress, userAgent) {
    return await db('access_logs').insert({
      shop_domain: shopDomain,
      product_id: productId,
      customer_id: customerId,
      access_type: accessType,
      ip_address: ipAddress,
      user_agent: userAgent
    });
  },

  async getAnalytics(shopDomain, days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    return await db('access_logs')
      .where('shop_domain', shopDomain)
      .where('created_at', '>=', startDate)
      .select('access_type')
      .count('* as count')
      .groupBy('access_type');
  }
};

module.exports = {
  db,
  setupDatabase,
  AppSettings,
  ProductRestrictions,
  CollectionExceptions,
  AccessLogs
};


