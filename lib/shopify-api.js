const { shopifyApi } = require('@shopify/shopify-api');

class ShopifyAPIClient {
  constructor(session) {
    this.session = session;
    this.client = new shopifyApi.clients.Rest({
      session: session,
      apiVersion: '2024-01'
    });
  }

  // Customer operations
  async getCustomer(customerId) {
    try {
      const response = await this.client.get({
        path: `customers/${customerId}.json`
      });
      return response.body.customer;
    } catch (error) {
      console.error('Error fetching customer:', error);
      throw error;
    }
  }

  async getCustomerByEmail(email) {
    try {
      const response = await this.client.get({
        path: 'customers/search.json',
        query: { query: email }
      });
      return response.body.customers?.[0] || null;
    } catch (error) {
      console.error('Error searching customer:', error);
      throw error;
    }
  }

  async updateCustomerTags(customerId, tags) {
    try {
      const response = await this.client.put({
        path: `customers/${customerId}.json`,
        data: {
          customer: {
            id: customerId,
            tags: tags
          }
        }
      });
      return response.body.customer;
    } catch (error) {
      console.error('Error updating customer tags:', error);
      throw error;
    }
  }

  // Product operations
  async getProduct(productId) {
    try {
      const response = await this.client.get({
        path: `products/${productId}.json`
      });
      return response.body.product;
    } catch (error) {
      console.error('Error fetching product:', error);
      throw error;
    }
  }

  async getProducts(limit = 250, pageInfo = null) {
    try {
      const query = { limit };
      if (pageInfo) query.page_info = pageInfo;

      const response = await this.client.get({
        path: 'products.json',
        query
      });
      return {
        products: response.body.products,
        pageInfo: response.pageInfo
      };
    } catch (error) {
      console.error('Error fetching products:', error);
      throw error;
    }
  }

  async getAllProducts() {
    const allProducts = [];
    let pageInfo = null;

    do {
      const result = await this.getProducts(250, pageInfo);
      allProducts.push(...result.products);
      pageInfo = result.pageInfo?.nextPageUrl ? result.pageInfo : null;
    } while (pageInfo);

    return allProducts;
  }

  async updateProductMetafields(productId, metafields) {
    try {
      const promises = metafields.map(metafield => 
        this.client.post({
          path: 'metafields.json',
          data: {
            metafield: {
              namespace: 'malia_pro_access',
              key: metafield.key,
              value: metafield.value,
              type: metafield.type,
              owner_resource: 'product',
              owner_id: productId
            }
          }
        })
      );
      
      return await Promise.all(promises);
    } catch (error) {
      console.error('Error updating product metafields:', error);
      throw error;
    }
  }

  // Collection operations
  async getCollection(collectionId) {
    try {
      const response = await this.client.get({
        path: `collections/${collectionId}.json`
      });
      return response.body.collection;
    } catch (error) {
      console.error('Error fetching collection:', error);
      throw error;
    }
  }

  async getCollections(limit = 250) {
    try {
      const response = await this.client.get({
        path: 'collections.json',
        query: { limit }
      });
      return response.body.collections;
    } catch (error) {
      console.error('Error fetching collections:', error);
      throw error;
    }
  }

  // Order operations
  async getOrder(orderId) {
    try {
      const response = await this.client.get({
        path: `orders/${orderId}.json`
      });
      return response.body.order;
    } catch (error) {
      console.error('Error fetching order:', error);
      throw error;
    }
  }

  async cancelOrder(orderId, reason = 'restricted_product') {
    try {
      const response = await this.client.post({
        path: `orders/${orderId}/cancel.json`,
        data: {
          reason: reason
        }
      });
      return response.body.order;
    } catch (error) {
      console.error('Error canceling order:', error);
      throw error;
    }
  }

  // Webhook operations
  async createWebhook(topic, address) {
    try {
      const response = await this.client.post({
        path: 'webhooks.json',
        data: {
          webhook: {
            topic: topic,
            address: address,
            format: 'json'
          }
        }
      });
      return response.body.webhook;
    } catch (error) {
      console.error('Error creating webhook:', error);
      throw error;
    }
  }

  async getWebhooks() {
    try {
      const response = await this.client.get({
        path: 'webhooks.json'
      });
      return response.body.webhooks;
    } catch (error) {
      console.error('Error fetching webhooks:', error);
      throw error;
    }
  }

  async deleteWebhook(webhookId) {
    try {
      await this.client.delete({
        path: `webhooks/${webhookId}.json`
      });
      return true;
    } catch (error) {
      console.error('Error deleting webhook:', error);
      throw error;
    }
  }

  // Utility methods
  async validateCustomerAccess(customerId, requiredTag = 'butterfly_paid') {
    try {
      if (!customerId) return { hasAccess: false, reason: 'not_logged_in' };

      const customer = await this.getCustomer(customerId);
      if (!customer) return { hasAccess: false, reason: 'customer_not_found' };

      const hasTag = customer.tags && customer.tags.includes(requiredTag);
      return { 
        hasAccess: hasTag, 
        reason: hasTag ? 'authorized' : 'no_tag',
        customer: customer
      };
    } catch (error) {
      console.error('Error validating customer access:', error);
      return { hasAccess: false, reason: 'error' };
    }
  }

  async isProductRestricted(productId, shopDomain) {
    try {
      const { ProductRestrictions, CollectionExceptions } = require('./database');
      
      // Check if product is explicitly restricted
      const restriction = await ProductRestrictions.getByProduct(shopDomain, productId);
      if (restriction) {
        return restriction.is_restricted;
      }

      // Check if product is in an exception collection
      const product = await this.getProduct(productId);
      if (product && product.product_type) {
        // Check if any of the product's collections are exceptions
        const collections = await this.getCollections();
        const exceptionCollections = await CollectionExceptions.getAll(shopDomain);
        
        for (const collection of collections) {
          const isException = exceptionCollections.find(
            ex => ex.collection_id === collection.id && ex.is_exception
          );
          if (isException) {
            return false; // Product is in exception collection
          }
        }
      }

      // Default to restricted (pro-only)
      return true;
    } catch (error) {
      console.error('Error checking product restriction:', error);
      return true; // Default to restricted on error
    }
  }
}

module.exports = ShopifyAPIClient;


