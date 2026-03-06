# Xero & Supabase Deep Integration Guide

## Complete Xero Integration Documentation for flowsync.buzz

This document provides comprehensive, production-ready documentation for Xero OAuth 2.0 integration, invoice management, contact operations, webhooks, and advanced Supabase database patterns for `kvmibliftapvaxplrtmy`.

---

## Table of Contents

1. [Xero OAuth 2.0 Complete Flow](#xero-oauth-20-complete-flow)
2. [Xero Invoice Management](#xero-invoice-management)
3. [Xero Contact Management](#xero-contact-management)  
4. [Xero Bank Transactions](#xero-bank-transactions)
5. [Xero Reports & Analytics](#xero-reports--analytics)
6. [Xero Webhooks Implementation](#xero-webhooks-implementation)
7. [Xero Rate Limiting & Error Handling](#xero-rate-limiting--error-handling)
8. [Advanced Supabase Database Patterns](#advanced-supabase-database-patterns)
9. [Real-time Data Patterns (Polling)](#real-time-data-patterns)
10. [Performance Optimization](#performance-optimization)

---

## Xero OAuth 2.0 Complete Flow

### Authorization Flow Diagram

```
User → Your App → Xero Login → User Approves → Xero Redirect → Exchange Code → Store Tokens
```

### 1. Initialize OAuth (Client-Side)

```typescript
// Generate authorization URL
const initiateXeroOAuth = async () => {
  const state = crypto.randomUUID(); // CSRF protection
  localStorage.setItem('xero_oauth_state', state);
  
  const authUrl = 'https://login.xero.com/identity/connect/authorize?' + new URLSearchParams({
    response_type: 'code',
    client_id: XERO_CLIENT_ID,
    redirect_uri: `${window.location.origin}/xero/callback`,
    scope: 'openid profile email accounting.transactions accounting.contacts accounting.settings offline_access',
    state: state
  });
  
  // Redirect user to Xero
  window.location.href = authUrl;
};
```

### 2. Handle Callback (Client-Side)

```typescript
// On callback page /xero/callback
const handleXeroCallback = async () => {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');
  
  // Verify CSRF state
  const savedState = localStorage.getItem('xero_oauth_state');
  if (state !== savedState) {
    throw new Error('Invalid state - possible CSRF attack');
  }
  
  if (error) {
    throw new Error(`OAuth error: ${error}`);
  }
  
  // Exchange code for tokens via Edge Function
  const { data, error: tokenError } = await supabase.functions.invoke('xero-oauth', {
    body: {
      action: 'exchange_code',
      code: code,
      redirect_uri: `${window.location.origin}/xero/callback`
    }
  });
  
  if (tokenError) throw tokenError;
  
  // Clean up
  localStorage.removeItem('xero_oauth_state');
  
  // Redirect to dashboard
  window.location.href = '/dashboard';
};
```

### 3. Token Exchange (Edge Function)

```typescript
// supabase/functions/xero-oauth/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

serve(async (req) => {
  const { action, code, redirect_uri } = await req.json();
  
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  // Get user from JWT
  const authHeader = req.headers.get('Authorization')!;
  const token = authHeader.replace('Bearer ', '');
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  
  if (!user) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Exchange code for tokens
  const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + btoa(`${Deno.env.get('XERO_CLIENT')}:${Deno.env.get('XERO_SECRET')}`)
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: redirect_uri
    })
  });
  
  const tokens = await tokenResponse.json();
  
  // Get tenant connections
  const connectionsResponse = await fetch('https://api.xero.com/connections', {
    headers: {
      'Authorization': `Bearer ${tokens.access_token}`,
      'Content-Type': 'application/json'
    }
  });
  
  const tenants = await connectionsResponse.json();
  
  // Store tokens for each tenant
  for (const tenant of tenants) {
    await supabaseAdmin.from('xero_connections').upsert({
      user_id: user.id,
      tenant_id: tenant.tenantId,
      tenant_name: tenant.tenantName,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
      updated_at: new Date().toISOString()
    });
  }
  
  return new Response(JSON.stringify({ tenants }), {
    headers: { 'Content-Type': 'application/json' }
  });
});
```

### 4. Automatic Token Refresh

```typescript
// Auto-refresh Xero token when needed
async function getValidXeroToken(userId: string, tenantId: string) {
  // Get current token
  const { data: connection } = await supabase
    .from('xero_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .single();
  
  if (!connection) throw new Error('No Xero connection found');
  
  // Check if token is expired or about to expire (within 10 minutes)
  const expiresAt = new Date(connection.expires_at);
  const now = new Date();
  const minutesUntilExpiry = (expiresAt.getTime() - now.getTime()) / 1000 / 60;
  
  if (minutesUntilExpiry > 10) {
    return connection.access_token; // Token still valid
  }
  
  // Refresh the token
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
  
  // Update database
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

---

## Xero Invoice Management

### Create Comprehensive Invoice

```typescript
async function createXeroInvoice(invoiceData: {
  contactId: string;
  reference: string;
  lineItems: Array<{
    description: string;
    quantity: number;
    unitAmount: number;
    accountCode?: string;
    taxType?: string;
    discountRate?: number;
  }>;
  dueDate?: string;
  currency?: string;
}) {
  const accessToken = await getValidXeroToken(userId, tenantId);
  
  const invoice = {
    Type: 'ACCREC', // Accounts Receivable (Sales Invoice)
    Contact: {
      ContactID: invoiceData.contactId
    },
    Date: new Date().toISOString().split('T')[0],
    DueDate: invoiceData.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    Reference: invoiceData.reference,
    LineAmountTypes: 'Exclusive', // Tax exclusive
    Status: 'DRAFT',
    CurrencyCode: invoiceData.currency || 'USD',
    LineItems: invoiceData.lineItems.map(item => ({
      Description: item.description,
      Quantity: item.quantity,
      UnitAmount: item.unitAmount,
      AccountCode: item.accountCode || '200', // Revenue account
      TaxType: item.taxType || 'OUTPUT2', // Standard tax rate
      DiscountRate: item.discountRate || 0
    }))
  };
  
  const response = await fetch('https://api.xero.com/api.xro/2.0/Invoices', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ Invoices: [invoice] })
  });
  
  const result = await response.json();
  return result.Invoices[0];
}
```

### Get Invoices with Advanced Filtering

```typescript
async function getXeroInvoices(filters: {
  status?: 'DRAFT' | 'SUBMITTED' | 'AUTHORISED' | 'PAID' | 'VOIDED';
  contactId?: string;
  dateFrom?: string;
  dateTo?: string;
  overdue?: boolean;
  minAmount?: number;
  page?: number;
}) {
  const accessToken = await getValidXeroToken(userId, tenantId);
  
  // Build where clause
  const conditions: string[] = [];
  
  if (filters.status) {
    conditions.push(`Status=="$ {filters.status}"`);
  }
  
  if (filters.contactId) {
    conditions.push(`Contact.ContactID==Guid("${filters.contactId}")`);
  }
  
  if (filters.dateFrom && filters.dateTo) {
    conditions.push(`Date>=DateTime(${filters.dateFrom}) AND Date<=DateTime(${filters.dateTo})`);
  }
  
  if (filters.overdue) {
    conditions.push('Status=="AUTHORISED" AND DueDate<DateTime.Now');
  }
  
  if (filters.minAmount) {
    conditions.push(`Total>=${filters.minAmount}`);
  }
  
  const where = conditions.length > 0 ? conditions.join(' AND ') : '';
  
  const params = new URLSearchParams({
    where: where,
    order: 'Date DESC',
    page: String(filters.page || 1)
  });
  
  const response = await fetch(`https://api.xero.com/api.xro/2.0/Invoices?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId
    }
  });
  
  const result = await response.json();
  return result.Invoices;
}
```

### Update Invoice Status

```typescript
async function updateInvoiceStatus(invoiceId: string, status: 'AUTHORISED' | 'VOIDED') {
  const accessToken = await getValidXeroToken(userId, tenantId);
  
  const response = await fetch(`https://api.xero.com/api.xro/2.0/Invoices/${invoiceId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      Invoices: [{
        InvoiceID: invoiceId,
        Status: status
      }]
    })
  });
  
  const result = await response.json();
  return result.Invoices[0];
}
```

### Record Invoice Payment

```typescript
async function recordInvoicePayment(invoiceId: string, payment: {
  amount: number;
  date: string;
  accountCode: string;
  reference?: string;
}) {
  const accessToken = await getValidXeroToken(userId, tenantId);
  
  const paymentData = {
    Invoice: {
      InvoiceID: invoiceId
    },
    Account: {
      Code: payment.accountCode // e.g., '090' for bank account
    },
    Date: payment.date,
    Amount: payment.amount,
    Reference: payment.reference || 'Payment received',
    PaymentType: 'ACCRECPAYMENT' // Accounts Receivable Payment
  };
  
  const response = await fetch('https://api.xero.com/api.xro/2.0/Payments', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ Payments: [paymentData] })
  });
  
  const result = await response.json();
  return result.Payments[0];
}
```

---

## Xero Contact Management

### Create Contact with Full Details

```typescript
async function createXeroContact(contactData: {
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address?: {
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
  };
  taxNumber?: string;
  isCustomer?: boolean;
  isSupplier?: boolean;
}) {
  const accessToken = await getValidXeroToken(userId, tenantId);
  
  const contact = {
    Name: contactData.name,
    FirstName: contactData.firstName,
    LastName: contactData.lastName,
    EmailAddress: contactData.email,
    ContactStatus: 'ACTIVE',
    IsCustomer: contactData.isCustomer !== false,
    IsSupplier: contactData.isSupplier || false,
    TaxNumber: contactData.taxNumber,
    Phones: contactData.phone ? [{
      PhoneType: 'DEFAULT',
      PhoneNumber: contactData.phone
    }] : [],
    Addresses: contactData.address ? [{
      AddressType: 'STREET',
      AddressLine1: contactData.address.line1,
      AddressLine2: contactData.address.line2,
      City: contactData.address.city,
      Region: contactData.address.region,
      PostalCode: contactData.address.postalCode,
      Country: contactData.address.country || 'United States'
    }] : []
  };
  
  const response = await fetch('https://api.xero.com/api.xro/2.0/Contacts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ Contacts: [contact] })
  });
  
  const result = await response.json();
  return result.Contacts[0];
}
```

### Search Contacts

```typescript
async function searchXeroContacts(searchTerm: string) {
  const accessToken = await getValidXeroToken(userId, tenantId);
  
  const params = new URLSearchParams({
    where: `Name.Contains("${searchTerm}") OR EmailAddress.Contains("${searchTerm}")`,
    order: 'Name ASC'
  });
  
  const response = await fetch(`https://api.xero.com/api.xro/2.0/Contacts?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId
    }
  });
  
  const result = await response.json();
  return result.Contacts;
}
```

---

## Xero Bank Transactions

### Get Bank Transactions

```typescript
async function getBankTransactions(filters: {
  accountId?: string;
  dateFrom?: string;
  dateTo?: string;
  type?: 'SPEND' | 'RECEIVE';
}) {
  const accessToken = await getValidXeroToken(userId, tenantId);
  
  const conditions: string[] = [];
  
  if (filters.accountId) {
    conditions.push(`BankAccount.AccountID==Guid("${filters.accountId}")`);
  }
  
  if (filters.type) {
    conditions.push(`Type=="${filters.type}"`);
  }
  
  if (filters.dateFrom && filters.dateTo) {
    conditions.push(`Date>=DateTime(${filters.dateFrom}) AND Date<=DateTime(${filters.dateTo})`);
  }
  
  const where = conditions.length > 0 ? conditions.join(' AND ') : '';
  
  const params = new URLSearchParams({
    where: where,
    order: 'Date DESC'
  });
  
  const response = await fetch(`https://api.xero.com/api.xro/2.0/BankTransactions?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId
    }
  });
  
  const result = await response.json();
  return result.BankTransactions;
}
```

---

## Xero Reports & Analytics

### Get Profit & Loss Report

```typescript
async function getProfitAndLoss(dateFrom: string, dateTo: string) {
  const accessToken = await getValidXeroToken(userId, tenantId);
  
  const params = new URLSearchParams({
    fromDate: dateFrom,
    toDate: dateTo
  });
  
  const response = await fetch(`https://api.xero.com/api.xro/2.0/Reports/ProfitAndLoss?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId
    }
  });
  
  const result = await response.json();
  return result.Reports[0];
}
```

### Get Balance Sheet

```typescript
async function getBalanceSheet(date: string) {
  const accessToken = await getValidXeroToken(userId, tenantId);
  
  const params = new URLSearchParams({
    date: date
  });
  
  const response = await fetch(`https://api.xero.com/api.xro/2.0/Reports/BalanceSheet?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId
    }
  });
  
  const result = await response.json();
  return result.Reports[0];
}
```

### Get Aged Receivables

```typescript
async function getAgedReceivables(contactId?: string) {
  const accessToken = await getValidXeroToken(userId, tenantId);
  
  const params = new URLSearchParams({
    contactID: contactId || '',
    date: new Date().toISOString().split('T')[0]
  });
  
  const response = await fetch(`https://api.xero.com/api.xro/2.0/Reports/AgedReceivablesByContact?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Xero-Tenant-Id': tenantId
    }
  });
  
  const result = await response.json();
  return result.Reports[0];
}
```

---

## Xero Webhooks Implementation

### Setup Webhook Endpoint (Edge Function)

```typescript
// supabase/functions/xero-webhooks/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
  
  // Parse payload
  const payload = JSON.parse(body);
  
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );
  
  // Process each event
  for (const event of payload.events) {
    console.log('Webhook event:', event);
    
    const { eventCategory, eventType, resourceId, tenantId } = event;
    
    switch (eventCategory) {
      case 'INVOICE':
        await handleInvoiceEvent(supabaseAdmin, event);
        break;
      case 'CONTACT':
        await handleContactEvent(supabaseAdmin, event);
        break;
      case 'PAYMENT':
        await handlePaymentEvent(supabaseAdmin, event);
        break;
      default:
        console.log('Unhandled event category:', eventCategory);
    }
  }
  
  // Must return 200 OK
  return new Response('OK', { status: 200 });
});

async function handleInvoiceEvent(supabase: any, event: any) {
  const { resourceId, eventType, tenantId } = event;
  
  // Get user from tenant_id
  const { data: connection } = await supabase
    .from('xero_connections')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .single();
  
  if (!connection) return;
  
  if (eventType === 'CREATE' || eventType === 'UPDATE') {
    // Fetch full invoice details
    const invoice = await fetchInvoiceFromXero(resourceId, tenantId);
    
    // Store/update in your database for caching
    await supabase.from('invoice_cache').upsert({
      xero_invoice_id: resourceId,
      user_id: connection.user_id,
      tenant_id: tenantId,
      invoice_number: invoice.InvoiceNumber,
      contact_name: invoice.Contact.Name,
      total: invoice.Total,
      status: invoice.Status,
      due_date: invoice.DueDate,
      synced_at: new Date().toISOString()
    });
    
    // Send notification if invoice is paid
    if (invoice.Status === 'PAID') {
      await sendInvoicePaidNotification(connection.user_id, invoice);
    }
  }
}
```

### Configure Webhook in Xero

```bash
# Use Xero Developer Portal to:
# 1. Go to https://developer.xero.com/myapps
# 2. Select your app
# 3. Add webhook URL: https://your-project.supabase.co/functions/v1/xero-webhooks
# 4. Generate webhook key (store in XERO_WEBHOOK_KEY environment variable)
# 5. Subscribe to events: INVOICE.*, CONTACT.*, PAYMENT.*
```

---

## Xero Rate Limiting & Error Handling

### Rate Limits

- **60 API calls per minute** per tenant
- **5,000 API calls per day** per tenant
- **10,000 API calls per day** per app

### Implement Exponential Backoff

```typescript
async function callXeroAPIWithRetry(url: string, options: RequestInit, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Check for rate limit
      if (response.status === 429) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter ? parseInt(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
        
        console.log(`Rate limited. Retrying after ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      if (!response.ok) {
        throw new Error(`Xero API error: ${response.status} ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
      
      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### Error Handling Best Practices

```typescript
async function safeXeroAPICall(apiCall: () => Promise<any>) {
  try {
    return await apiCall();
  } catch (error: any) {
    // Handle specific Xero errors
    if (error.status === 401) {
      // Token expired - refresh and retry
      console.error('Xero token expired - refreshing...');
      throw new Error('Authentication required - please reconnect Xero');
    } else if (error.status === 403) {
      // Permission denied
      throw new Error('Insufficient Xero permissions - please check your Xero subscription');
    } else if (error.status === 429) {
      // Rate limit
      throw new Error('Rate limit exceeded - please try again later');
    } else if (error.status === 500) {
      // Xero server error
      throw new Error('Xero service temporarily unavailable');
    } else {
      // Generic error
      throw new Error(`Xero API error: ${error.message}`);
    }
  }
}
```

---

## Advanced Supabase Database Patterns

### Complex Multi-Table Dashboard Query

```sql
-- Get complete user dashboard data in single query
SELECT 
  up.id,
  up.username,
  up.email,
  
  -- Company Settings
  us.company_name,
  us.business_type,
  us.currency,
  us.country,
  us.payflow_connected,
  us.two_factor_enabled,
  
  -- Subscription Info
  s.plan_type,
  s.status AS subscription_status,
  s.end_date,
  CASE 
    WHEN s.end_date IS NULL THEN 'lifetime'
    WHEN s.end_date > NOW() THEN EXTRACT(DAY FROM (s.end_date - NOW()))::INT
    ELSE 0
  END AS days_remaining,
  
  -- Xero Integration
  xc.tenant_name AS xero_tenant,
  xc.expires_at AS xero_token_expires,
  CASE WHEN xc.expires_at > NOW() THEN true ELSE false END AS xero_active,
  
  -- Activity Metrics
  (SELECT COUNT(DISTINCT session_id) FROM chat_history WHERE user_id = up.id) AS total_chat_sessions,
  (SELECT COUNT(*) FROM chat_history WHERE user_id = up.id) AS total_chat_messages,
  (SELECT MAX(created_at) FROM chat_history WHERE user_id = up.id) AS last_chat_date,
  
  -- Timestamps
  us.created_at AS account_created,
  GREATEST(us.updated_at, s.updated_at, xc.updated_at) AS last_activity

FROM user_profiles up
LEFT JOIN user_settings us ON up.id = us.user_id
LEFT JOIN subscriptions s ON up.id = s.user_id AND s.status = 'active'
LEFT JOIN xero_connections xc ON up.id = xc.user_id
WHERE up.id = auth.uid();
```

### User Engagement Scoring

```sql
-- Calculate user engagement score based on activity
WITH user_activity AS (
  SELECT 
    up.id,
    up.username,
    
    -- Chat engagement (2 points per session, 0.5 per message)
    COUNT(DISTINCT ch.session_id) * 2 AS chat_session_points,
    COUNT(ch.id) * 0.5 AS chat_message_points,
    
    -- Xero integration (10 points if connected)
    CASE WHEN xc.id IS NOT NULL THEN 10 ELSE 0 END AS xero_points,
    
    -- Subscription tier points
    CASE s.plan_type
      WHEN 'premium' THEN 20
      WHEN 'pro' THEN 15
      WHEN 'basic' THEN 10
      ELSE 5
    END AS subscription_points,
    
    -- Recent activity (15 points if active in last week)
    CASE 
      WHEN MAX(ch.created_at) > NOW() - INTERVAL '7 days' THEN 15
      WHEN MAX(ch.created_at) > NOW() - INTERVAL '30 days' THEN 10
      WHEN MAX(ch.created_at) > NOW() - INTERVAL '90 days' THEN 5
      ELSE 0
    END AS recency_points
    
  FROM user_profiles up
  LEFT JOIN chat_history ch ON up.id = ch.user_id
  LEFT JOIN xero_connections xc ON up.id = xc.user_id
  LEFT JOIN subscriptions s ON up.id = s.user_id AND s.status = 'active'
  WHERE up.id = auth.uid()
  GROUP BY up.id, up.username, xc.id, s.plan_type
)
SELECT 
  *,
  (chat_session_points + chat_message_points + xero_points + subscription_points + recency_points) AS total_score,
  CASE 
    WHEN (chat_session_points + chat_message_points + xero_points + subscription_points + recency_points) > 100 THEN 'power_user'
    WHEN (chat_session_points + chat_message_points + xero_points + subscription_points + recency_points) > 50 THEN 'active'
    WHEN (chat_session_points + chat_message_points + xero_points + subscription_points + recency_points) > 20 THEN 'casual'
    ELSE 'inactive'
  END AS user_segment
FROM user_activity;
```

### Full-Text Search with Ranking

```sql
-- Setup full-text search
ALTER TABLE chat_history ADD COLUMN content_vector tsvector;

CREATE INDEX chat_content_search_idx ON chat_history USING GIN (content_vector);

-- Auto-update search vectors
CREATE OR REPLACE FUNCTION update_content_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.content_vector = to_tsvector('english', NEW.content);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER chat_content_search_update
  BEFORE INSERT OR UPDATE ON chat_history
  FOR EACH ROW
  EXECUTE FUNCTION update_content_search_vector();

-- Search with ranking
SELECT 
  id,
  session_id,
  content,
  ts_rank(content_vector, query) AS rank,
  ts_headline('english', content, query, 'MaxWords=50, MinWords=25') AS snippet
FROM chat_history,
     plainto_tsquery('english', 'invoice payment processing') AS query
WHERE content_vector @@ query
  AND user_id = auth.uid()
ORDER BY rank DESC
LIMIT 20;
```

### Advanced RLS with Role-Based Access

```sql
-- Team collaboration with roles
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  user_id UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE shared_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL,
  created_by UUID NOT NULL REFERENCES user_profiles(id),
  title TEXT NOT NULL,
  content TEXT,
  visibility TEXT DEFAULT 'team', -- 'private', 'team', 'public'
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE shared_documents ENABLE ROW LEVEL SECURITY;

-- RLS: View documents based on role and visibility
CREATE POLICY "view_documents_based_on_role"
ON shared_documents FOR SELECT
TO authenticated
USING (
  visibility = 'public'
  OR created_by = auth.uid()
  OR team_id IN (
    SELECT team_id 
    FROM team_members 
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin', 'member', 'viewer')
  )
);

-- RLS: Only owners/admins can create documents
CREATE POLICY "create_documents_owner_admin"
ON shared_documents FOR INSERT
TO authenticated
WITH CHECK (
  team_id IN (
    SELECT team_id 
    FROM team_members 
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  )
);

-- RLS: Update - owner/admin or document creator
CREATE POLICY "update_documents_owner_admin_creator"
ON shared_documents FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  OR team_id IN (
    SELECT team_id 
    FROM team_members 
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  )
);

-- RLS: Delete - owner only
CREATE POLICY "delete_documents_owner_only"
ON shared_documents FOR DELETE
TO authenticated
USING (
  team_id IN (
    SELECT team_id 
    FROM team_members 
    WHERE user_id = auth.uid()
    AND role = 'owner'
  )
);
```

### Database Functions & Triggers

```sql
-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_user_settings_timestamp
  BEFORE UPDATE ON user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_timestamp
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_xero_connections_timestamp
  BEFORE UPDATE ON xero_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Soft delete with audit trail
CREATE TABLE deleted_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  record_data JSONB NOT NULL,
  deleted_by UUID REFERENCES user_profiles(id),
  deleted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION soft_delete_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO deleted_records (table_name, record_id, record_data, deleted_by)
  VALUES (TG_TABLE_NAME, OLD.id, row_to_json(OLD), auth.uid());
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply to tables
CREATE TRIGGER track_chat_deletions
  BEFORE DELETE ON chat_history
  FOR EACH ROW
  EXECUTE FUNCTION soft_delete_audit();

-- Email validation function
CREATE OR REPLACE FUNCTION is_valid_email(email TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}$';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Apply as constraint
ALTER TABLE user_profiles 
ADD CONSTRAINT valid_email_format 
CHECK (is_valid_email(email));
```

---

## Real-time Data Patterns

### Polling Implementation (OnSpace Cloud Compatible)

```typescript
// Polling-based real-time updates
class DataPoller {
  private callbacks: Array<(data: any) => void> = [];
  private lastFetchTime: Date = new Date();
  private polling: boolean = false;
  
  constructor(
    private tableName: string,
    private interval: number = 5000
  ) {}
  
  subscribe(callback: (data: any) => void) {
    this.callbacks.push(callback);
    
    if (!this.polling) {
      this.start();
    }
    
    // Return unsubscribe function
    return () => {
      this.callbacks = this.callbacks.filter(cb => cb !== callback);
      if (this.callbacks.length === 0) {
        this.stop();
      }
    };
  }
  
  private async start() {
    this.polling = true;
    this.lastFetchTime = new Date();
    
    const poll = async () => {
      if (!this.polling) return;
      
      try {
        // Fetch records updated since last poll
        const { data, error } = await supabase
          .from(this.tableName)
          .select('*')
          .gte('updated_at', this.lastFetchTime.toISOString())
          .order('updated_at', { ascending: false });
        
        if (!error && data && data.length > 0) {
          this.lastFetchTime = new Date();
          
          // Notify all subscribers
          this.callbacks.forEach(callback => {
            callback({ eventType: 'UPDATE', new: data });
          });
        }
      } catch (err) {
        console.error('Polling error:', err);
      }
      
      // Schedule next poll
      setTimeout(poll, this.interval);
    };
    
    poll();
  }
  
  stop() {
    this.polling = false;
  }
}

// Usage
const subscriptionPoller = new DataPoller('subscriptions', 3000);

const unsubscribe = subscriptionPoller.subscribe((payload) => {
  console.log('Subscriptions updated:', payload.new);
  updateUI(payload.new);
});

// Clean up when component unmounts
// unsubscribe();
```

---

## Performance Optimization

### Recommended Indexes

```sql
-- Performance indexes for frequent queries
CREATE INDEX IF NOT EXISTS idx_chat_user_session 
  ON chat_history(user_id, session_id);

CREATE INDEX IF NOT EXISTS idx_chat_created_desc 
  ON chat_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status 
  ON subscriptions(user_id, status);

CREATE INDEX IF NOT EXISTS idx_xero_user_expires 
  ON xero_connections(user_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_user_settings_user_id 
  ON user_settings(user_id);
```

### Query Performance Analysis

```sql
-- Analyze query performance
EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
SELECT 
  up.username,
  COUNT(ch.id) AS message_count
FROM user_profiles up
LEFT JOIN chat_history ch ON up.id = ch.user_id
WHERE up.id = 'USER-UUID'
GROUP BY up.username;

-- Check index usage
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan AS scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Find missing indexes
SELECT 
  schemaname,
  tablename,
  seq_scan,
  seq_tup_read,
  idx_scan,
  seq_tup_read / seq_scan AS avg_rows_per_scan
FROM pg_stat_user_tables
WHERE seq_scan > 0
  AND schemaname = 'public'
ORDER BY seq_tup_read DESC
LIMIT 10;
```

### Connection Pooling Best Practices

```typescript
// Use Supabase client singleton
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.VITE_SUPABASE_ANON_KEY!,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    },
    db: {
      schema: 'public'
    },
    global: {
      headers: { 'x-app-name': 'flowsync' }
    }
  }
);

export default supabase;
```

### Caching Strategy

```typescript
// Simple in-memory cache for user settings
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
  
  invalidate(key: string) {
    this.cache.delete(key);
  }
  
  clear() {
    this.cache.clear();
  }
}

const cache = new CacheManager();

// Usage
async function getUserSettings(userId: string) {
  const cacheKey = `user_settings_${userId}`;
  
  // Check cache
  const cached = cache.get(cacheKey);
  if (cached) return cached;
  
  // Fetch from database
  const { data } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  // Cache for 5 minutes
  cache.set(cacheKey, data, 300);
  
  return data;
}
```

---

## Summary

This comprehensive guide provides production-ready implementations for:

1. **Complete Xero OAuth 2.0 flow** with automatic token refresh
2. **Full invoice management** (create, read, update, void, payment recording)
3. **Contact management** with advanced search
4. **Bank transactions** and reporting
5. **Webhooks** for real-time Xero event handling
6. **Rate limiting** and error handling
7. **Advanced Supabase patterns** (complex queries, full-text search, RLS)
8. **Performance optimization** (indexes, caching, connection pooling)
9. **Real-time data patterns** using polling (OnSpace Cloud compatible)

All code examples are TypeScript-based and ready for integration into your flowsync.buzz application using the `kvmibliftapvaxplrtmy` Supabase database.
