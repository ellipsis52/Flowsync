# Xero Integration - Quick Reference

## Complete Documentation

For complete and in-depth documentation on Xero and Supabase integration, see:

**[XERO_SUPABASE_ADVANCED_DOCS.md](./XERO_SUPABASE_ADVANCED_DOCS.md)**

This file contains:
- Complete OAuth 2.0 with automatic token refresh
- Full invoice management (create, read, update, void, payment recording)
- Contact management with advanced search
- Bank transactions and reporting
- Webhooks for real-time event handling
- Rate limiting and error handling
- Advanced Supabase patterns (complex queries, full-text search, RLS)
- Performance optimization (indexes, caching, connection pooling)
- Real-time data patterns using polling

## Quick Navigation

### Xero OAuth 2.0
```typescript
// 1. Initiate OAuth flow
const initiateXeroOAuth = async () => {
  const state = crypto.randomUUID();
  localStorage.setItem('xero_oauth_state', state);
  
  const authUrl = 'https://login.xero.com/identity/connect/authorize?' + new URLSearchParams({
    response_type: 'code',
    client_id: XERO_CLIENT_ID,
    redirect_uri: `${window.location.origin}/xero/callback`,
    scope: 'openid profile email accounting.transactions accounting.contacts accounting.settings offline_access',
    state: state
  });
  
  window.location.href = authUrl;
};
```

### Invoice Management
```typescript
// Create invoice
const invoice = await createXeroInvoice({
  contactId: 'CONTACT-001',
  reference: 'INV-2024-001',
  lineItems: [{
    description: 'Consulting Services',
    quantity: 10,
    unitAmount: 150.00,
    accountCode: '200',
    taxType: 'OUTPUT2'
  }]
});

// Get invoices with filters
const invoices = await getXeroInvoices({
  status: 'AUTHORISED',
  overdue: true,
  minAmount: 100
});

// Record payment
await recordInvoicePayment(invoiceId, {
  amount: 1500.00,
  date: new Date().toISOString(),
  accountCode: '090',
  reference: 'Payment received'
});
```

### Contact Management
```typescript
// Create contact
const contact = await createXeroContact({
  name: 'Acme Corporation',
  email: 'billing@acme.com',
  phone: '+1234567890',
  address: {
    line1: '123 Business St',
    city: 'New York',
    postalCode: '10001',
    country: 'United States'
  }
});

// Search contacts
const results = await searchXeroContacts('Acme');
```

### Automatic Token Refresh
```typescript
async function getValidXeroToken(userId: string, tenantId: string) {
  const { data: connection } = await supabase
    .from('xero_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .single();
  
  if (!connection) throw new Error('No Xero connection found');
  
  // Check if token expires within 10 minutes
  const expiresAt = new Date(connection.expires_at);
  const now = new Date();
  const minutesUntilExpiry = (expiresAt.getTime() - now.getTime()) / 1000 / 60;
  
  if (minutesUntilExpiry > 10) {
    return connection.access_token; // Token still valid
  }
  
  // Refresh token
  const refreshResponse = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`)
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: connection.refresh_token
    })
  });
  
  const newTokens = await refreshResponse.json();
  
  // Update in database
  await supabase
    .from('xero_connections')
    .update({
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      expires_at: new Date(Date.now() + newTokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString()
    })
    .eq('user_id', userId)
    .eq('tenant_id', tenantId);
  
  return newTokens.access_token;
}
```

## Xero Webhooks

### Configuration
1. Go to https://developer.xero.com/myapps
2. Select your app
3. Add webhook URL: `https://your-project.supabase.co/functions/v1/xero-webhooks`
4. Generate webhook key (store in `XERO_WEBHOOK_KEY`)
5. Subscribe to events: `INVOICE.*`, `CONTACT.*`, `PAYMENT.*`

### Implementation
```typescript
// Edge Function: xero-webhooks/index.ts
serve(async (req) => {
  const webhookKey = Deno.env.get('XERO_WEBHOOK_KEY')!;
  
  // Verify signature
  const signature = req.headers.get('x-xero-signature');
  const body = await req.text();
  
  const encoder = new TextEncoder();
  const keyData = encoder.encode(webhookKey + body);
  const hashBuffer = await crypto.subtle.digest('SHA-256', keyData);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const computedSignature = btoa(String.fromCharCode(...hashArray));
  
  if (signature !== computedSignature) {
    return new Response('Invalid signature', { status: 401 });
  }
  
  // Process events
  const payload = JSON.parse(body);
  for (const event of payload.events) {
    await handleXeroEvent(event);
  }
  
  return new Response('OK', { status: 200 });
});
```

## Rate Limiting

Xero API Limits:
- 60 calls per minute per tenant
- 5,000 calls per day per tenant
- 10,000 calls per day per app

### Retry Implementation with Exponential Backoff
```typescript
async function callXeroAPIWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
        
        console.log(`Rate limited. Retrying after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`Xero API error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}
```

## Advanced Supabase Patterns

### Complete Dashboard Query
```sql
-- Load all user data in a single query
SELECT 
  up.id, up.username, up.email,
  us.company_name, us.currency,
  s.plan_type, s.status,
  xc.tenant_name, xc.expires_at,
  (SELECT COUNT(DISTINCT session_id) FROM chat_history WHERE user_id = up.id) AS chat_sessions
FROM user_profiles up
LEFT JOIN user_settings us ON up.id = us.user_id
LEFT JOIN subscriptions s ON up.id = s.user_id AND s.status = 'active'
LEFT JOIN xero_connections xc ON up.id = xc.user_id
WHERE up.id = auth.uid();
```

### Xero Token Management
```sql
-- Check token status
SELECT 
  id, tenant_id, tenant_name, expires_at,
  CASE 
    WHEN expires_at > NOW() + INTERVAL '1 hour' THEN 'active'
    WHEN expires_at > NOW() THEN 'expiring_soon'
    ELSE 'expired'
  END AS token_status,
  EXTRACT(EPOCH FROM (expires_at - NOW())) / 60 AS minutes_until_expiry
FROM xero_connections
WHERE user_id = auth.uid();
```

## Performance Optimization

### Recommended Indexes
```sql
-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_chat_user_session 
  ON chat_history(user_id, session_id);

CREATE INDEX IF NOT EXISTS idx_xero_user_expires 
  ON xero_connections(user_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status 
  ON subscriptions(user_id, status);
```

### Caching Strategy
```typescript
class CacheManager {
  private cache: Map<string, { data: any; expiresAt: number }> = new Map();
  
  set(key: string, data: any, ttlSeconds: number = 300) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }
  
  get(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    return cached.data;
  }
}

// Usage
const cache = new CacheManager();
cache.set('xero_invoices_user_123', invoices, 60); // Cache for 1 minute
```

## Error Handling

### Error Handling Patterns
```typescript
async function safeXeroAPICall(apiCall: () => Promise<any>) {
  try {
    return await apiCall();
  } catch (error: any) {
    if (error.status === 401) {
      throw new Error('Xero authentication required - please reconnect');
    } else if (error.status === 403) {
      throw new Error('Insufficient Xero permissions');
    } else if (error.status === 429) {
      throw new Error('Rate limit exceeded - please try again later');
    } else if (error.status === 500) {
      throw new Error('Xero service temporarily unavailable');
    } else {
      throw new Error(`Xero API error: ${error.message}`);
    }
  }
}
```

## Resources

- [Xero Developer Portal](https://developer.xero.com/)
- [Xero API Documentation](https://developer.xero.com/documentation/)
- [Supabase Documentation](https://supabase.com/docs)
- [Documentation Complète - XERO_SUPABASE_ADVANCED_DOCS.md](./XERO_SUPABASE_ADVANCED_DOCS.md)

## Support

For any questions or issues:
- Email: support@flowsync.buzz
- API Documentation: https://flowsync.buzz/api-docs
