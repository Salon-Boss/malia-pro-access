# Malia Pro Access App - Deployment Guide

This guide covers the complete deployment process for the Malia Pro Access Shopify app.

## Prerequisites

- Node.js 18+ installed
- Shopify CLI 3.50+ installed
- A Shopify Partner account
- A development store or access to the target store
- ngrok or similar tunneling service for local development

## 1. Environment Setup

### 1.1 Install Dependencies

```bash
cd /Users/matt/Ai\ Coding/Malia\ Access\ App
npm install
```

### 1.2 Environment Configuration

1. Copy the example environment file:
```bash
cp env.example .env
```

2. Update `.env` with your actual values:
```env
# Shopify App Configuration
SHOPIFY_API_KEY=your_actual_api_key_here
SHOPIFY_API_SECRET=your_actual_api_secret_here
SHOPIFY_SCOPES=read_products,write_products,read_customers,write_customers,read_orders,write_orders,read_metafields,write_metafields,read_themes,write_themes
SHOPIFY_APP_URL=https://your-app-url.ngrok.io
SHOPIFY_APP_HANDLE=malia-pro-access

# Database
DATABASE_URL=sqlite:./database.sqlite

# Session Configuration
SESSION_SECRET=your_secure_session_secret_here

# App Settings
NODE_ENV=development
PORT=3000

# Malia Extensions Specific
BUTTERFLY_PAID_TAG=butterfly_paid
CERTIFICATION_URL=https://maliaextensions.com/pages/certification
DEFAULT_EDUCATION_COLLECTIONS=courses,in-person-education-1
```

### 1.3 Shopify App Configuration

1. Go to [Shopify Partners Dashboard](https://partners.shopify.com/)
2. Create a new app or use existing app
3. Set the following URLs:
   - **App URL**: `https://your-app-url.ngrok.io`
   - **Allowed redirection URL(s)**: 
     - `https://your-app-url.ngrok.io/api/auth/callback`
     - `https://your-app-url.ngrok.io/api/auth/shopify/callback`

## 2. Local Development

### 2.1 Start the Development Server

```bash
# Start ngrok tunnel (in a separate terminal)
ngrok http 3000

# Update your .env with the ngrok URL
# Then start the app
npm run dev
```

### 2.2 Install the App

1. Navigate to your development store
2. Go to Apps > App and sales channel settings
3. Click "Develop apps" > "Create an app"
4. Use your app's API credentials
5. Install the app on your development store

## 3. Theme Integration

### 3.1 Upload Theme Files

1. **Replace the main product template**:
   - Copy `theme_integration/sections/main-product-modified.liquid` to your theme's `sections/` folder
   - Rename it to `main-product.liquid` (backup the original first)

2. **Add the pro access snippets**:
   - Copy `theme_integration/snippets/malia-pro-access-gate.liquid` to your theme's `snippets/` folder
   - Copy `theme_integration/snippets/malia-pro-access-check.liquid` to your theme's `snippets/` folder

3. **Update theme.liquid** (optional - for global access control):
   - Remove or comment out the existing advanced registration logic (lines 1-87)
   - The app will handle access control through the product templates

### 3.2 Test Theme Integration

1. Visit a product page that should be restricted
2. Verify that the pro access gate appears instead of pricing/purchase options
3. Test with different customer states:
   - Not logged in
   - Logged in without `butterfly_paid` tag
   - Logged in with `butterfly_paid` tag

## 4. Checkout Extension Setup

### 4.1 Build the Checkout Extension

```bash
cd checkout_extension
npm install
npm run build
```

### 4.2 Deploy Checkout Extension

```bash
# From the checkout_extension directory
shopify app deploy
```

## 5. Production Deployment

### 5.1 Prepare for Production

1. **Update environment variables**:
   - Set `NODE_ENV=production`
   - Use production database (PostgreSQL recommended)
   - Use secure session secrets
   - Update app URLs to production domain

2. **Database setup** (for production):
   ```bash
   # Install PostgreSQL dependencies
   npm install pg knex
   
   # Update database configuration in lib/database.js
   # Use PostgreSQL connection string
   ```

3. **Security considerations**:
   - Use HTTPS in production
   - Set up proper CORS policies
   - Use environment-specific secrets
   - Enable rate limiting
   - Set up monitoring and logging

### 5.2 Deploy to Production Platform

#### Option A: Heroku

```bash
# Install Heroku CLI
# Create Heroku app
heroku create malia-pro-access-app

# Set environment variables
heroku config:set NODE_ENV=production
heroku config:set SHOPIFY_API_KEY=your_production_key
heroku config:set SHOPIFY_API_SECRET=your_production_secret
# ... set all other environment variables

# Deploy
git push heroku main
```

#### Option B: Railway

```bash
# Install Railway CLI
# Connect to Railway
railway login
railway init

# Set environment variables in Railway dashboard
# Deploy
railway up
```

#### Option C: DigitalOcean App Platform

1. Connect your GitHub repository
2. Set environment variables in the dashboard
3. Configure build and run commands
4. Deploy

### 5.3 Update Shopify App Settings

1. Go to your Shopify Partner Dashboard
2. Update app URLs to production:
   - **App URL**: `https://your-production-domain.com`
   - **Allowed redirection URL(s)**: `https://your-production-domain.com/api/auth/callback`

## 6. Testing

### 6.1 Run Test Suite

```bash
npm test
```

### 6.2 Manual Testing Checklist

- [ ] App installs successfully
- [ ] Admin interface loads and functions
- [ ] Product restrictions work correctly
- [ ] Customer access validation works
- [ ] Checkout extension prevents restricted purchases
- [ ] Webhooks process correctly
- [ ] Analytics data is collected
- [ ] Settings can be updated
- [ ] Bulk operations work
- [ ] Error handling works properly

### 6.3 User Acceptance Testing

1. **Test with different customer types**:
   - Create test customers with and without `butterfly_paid` tag
   - Test logged-in and logged-out scenarios

2. **Test product scenarios**:
   - Education products (should be accessible)
   - Regular products (should be restricted)
   - Products with custom restrictions

3. **Test checkout flow**:
   - Add restricted products to cart
   - Verify checkout extension blocks purchase
   - Test with valid pro customers

## 7. Monitoring and Maintenance

### 7.1 Set Up Monitoring

- **Application monitoring**: Use services like New Relic, DataDog, or Sentry
- **Database monitoring**: Monitor query performance and storage
- **Error tracking**: Set up error reporting and alerting
- **Analytics**: Monitor app usage and performance metrics

### 7.2 Regular Maintenance

- **Database cleanup**: Regularly clean old access logs
- **Security updates**: Keep dependencies updated
- **Performance optimization**: Monitor and optimize slow queries
- **Backup strategy**: Regular database backups

### 7.3 Troubleshooting

#### Common Issues:

1. **App not installing**:
   - Check API credentials
   - Verify redirect URLs
   - Check app permissions

2. **Theme integration not working**:
   - Verify Liquid snippets are uploaded
   - Check for JavaScript errors
   - Test with different themes

3. **Checkout extension issues**:
   - Verify extension is deployed
   - Check checkout extension logs
   - Test with different browsers

4. **Database issues**:
   - Check database connection
   - Verify table creation
   - Check for migration issues

## 8. Security Considerations

### 8.1 Data Protection

- **Customer data**: Only store necessary customer information
- **Access logs**: Implement data retention policies
- **API security**: Use proper authentication and authorization
- **Input validation**: Validate all user inputs

### 8.2 Compliance

- **GDPR**: Implement data deletion and export features
- **CCPA**: Provide customer data access and deletion
- **PCI DSS**: If handling payment data, ensure compliance

## 9. Support and Documentation

### 9.1 User Documentation

Create documentation for:
- How to install and configure the app
- How to manage product restrictions
- How to view analytics
- Troubleshooting common issues

### 9.2 Developer Documentation

- API documentation
- Database schema
- Extension development guide
- Contributing guidelines

## 10. Rollback Plan

### 10.1 Emergency Rollback

1. **Disable the app**:
   - Remove from store
   - Restore original theme files

2. **Database rollback**:
   - Restore from backup
   - Clean up app data if needed

3. **Communication**:
   - Notify stakeholders
   - Document the issue
   - Plan remediation

### 10.2 Gradual Rollback

1. **Feature flags**: Use feature flags to disable specific functionality
2. **A/B testing**: Test rollback with subset of users
3. **Monitoring**: Watch for issues during rollback

---

## Quick Start Commands

```bash
# Development
npm install
cp env.example .env
# Edit .env with your values
npm run dev

# Testing
npm test

# Production deployment
npm run build
# Deploy to your chosen platform

# Theme integration
# Upload theme files to your Shopify theme
# Test on development store

# Checkout extension
cd checkout_extension
npm install
npm run build
shopify app deploy
```

For additional support, refer to the [Shopify App Development Documentation](https://shopify.dev/docs/apps) or contact the development team.


