import React, { useEffect, useState } from 'react';
import {
  Banner,
  Button,
  BlockStack,
  InlineStack,
  Text,
  Icon,
  useApi,
  useTranslate,
  useSettings,
  useApplyCartLinesChange,
  useCartLines,
  useCustomer,
  useShop
} from '@shopify/ui-extensions-react/checkout';

export default function CheckoutExtension() {
  const { query, i18n } = useApi();
  const translate = useTranslate();
  const settings = useSettings();
  const applyCartLinesChange = useApplyCartLinesChange();
  const cartLines = useCartLines();
  const customer = useCustomer();
  const shop = useShop();
  
  const [restrictedItems, setRestrictedItems] = useState([]);
  const [isChecking, setIsChecking] = useState(true);
  const [hasRestrictedItems, setHasRestrictedItems] = useState(false);

  useEffect(() => {
    checkCartForRestrictedItems();
  }, [cartLines, customer]);

  const checkCartForRestrictedItems = async () => {
    setIsChecking(true);
    
    try {
      // Get cart line items
      const cartItems = cartLines.map(line => ({
        product_id: line.merchandise.product.id,
        variant_id: line.merchandise.id,
        quantity: line.quantity
      }));

      // Check with our app's API
      const response = await fetch('/apps/malia-pro-access/api/validate-cart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          cartItems,
          customerId: customer?.id || null
        })
      });

      const data = await response.json();
      
      if (data.restrictedItems && data.restrictedItems.length > 0) {
        setRestrictedItems(data.restrictedItems);
        setHasRestrictedItems(true);
        
        // Remove restricted items from cart
        const restrictedVariantIds = data.restrictedItems.map(item => item.variantId);
        const changes = cartLines
          .filter(line => restrictedVariantIds.includes(line.merchandise.id))
          .map(line => ({
            type: 'removeCartLine',
            id: line.id
          }));
        
        if (changes.length > 0) {
          await applyCartLinesChange(changes);
        }
      } else {
        setRestrictedItems([]);
        setHasRestrictedItems(false);
      }
    } catch (error) {
      console.error('Error checking cart for restricted items:', error);
    } finally {
      setIsChecking(false);
    }
  };

  const handleGetCertified = () => {
    // Open certification page in new tab
    window.open('https://maliaextensions.com/pages/certification', '_blank');
  };

  const handleCreateAccount = () => {
    // Redirect to account creation
    window.location.href = '/account/register';
  };

  const handleLogin = () => {
    // Redirect to login
    window.location.href = '/account/login';
  };

  if (isChecking) {
    return (
      <Banner status="info">
        <BlockStack spacing="tight">
          <Text>Checking product access...</Text>
        </BlockStack>
      </Banner>
    );
  }

  if (!hasRestrictedItems) {
    return null; // Don't show anything if no restricted items
  }

  // Determine what message to show based on customer status
  const isLoggedIn = !!customer;
  const hasButterflyTag = customer?.tags?.includes('butterfly_paid') || false;

  if (!isLoggedIn) {
    // Not logged in - show pro account message
    return (
      <Banner status="critical">
        <BlockStack spacing="tight">
          <InlineStack spacing="tight" blockAlignment="center">
            <Icon source="lock" />
            <Text size="medium" emphasis="strong">PRO ACCOUNT REQUIRED</Text>
          </InlineStack>
          <Text>
            MALIÁ PRODUCTS ARE AVAILABLE EXCLUSIVELY TO LICENSED HAIR STYLISTS.
          </Text>
          <Text>
            CREATE YOUR FREE PRO ACCOUNT TO ACCESS PROFESSIONAL PRICING, MALIÁ EDUCATION AND TO PLACE ORDERS.
          </Text>
          <InlineStack spacing="tight">
            <Button kind="primary" onPress={handleCreateAccount}>
              CREATE FREE PRO ACCOUNT
            </Button>
            <Button kind="secondary" onPress={handleLogin}>
              LOGIN
            </Button>
          </InlineStack>
          <Text size="small">
            <Button kind="plain" onPress={() => window.open('/pages/find-stylist', '_blank')}>
              LOCATE CERTIFIED MALIÁ STYLISTS NEAR YOU
            </Button>
          </Text>
        </BlockStack>
      </Banner>
    );
  }

  if (!hasButterflyTag) {
    // Logged in but no butterfly_paid tag - show certification message
    return (
      <Banner status="critical">
        <BlockStack spacing="tight">
          <InlineStack spacing="tight" blockAlignment="center">
            <Icon source="lock" />
            <Text size="medium" emphasis="strong">CERTIFICATION REQUIRED</Text>
          </InlineStack>
          <Text>
            GET CERTIFIED TO ACCESS PROFESSIONAL PRICING AND PLACE ORDERS.
          </Text>
          <InlineStack spacing="tight">
            <Button kind="primary" onPress={handleGetCertified}>
              GET CERTIFIED
            </Button>
          </InlineStack>
          <Text size="small">
            <Button kind="plain" onPress={() => window.open('/pages/find-stylist', '_blank')}>
              LOCATE CERTIFIED MALIÁ STYLISTS NEAR YOU
            </Button>
          </Text>
        </BlockStack>
      </Banner>
    );
  }

  return null;
}


