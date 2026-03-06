import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

interface XeroInvoice {
  InvoiceID: string;
  InvoiceNumber: string;
  Contact: {
    ContactID: string;
    Name: string;
  };
  Status: string;
  DateString: string;
  DueDateString: string;
  FullyPaidOnDate?: string;
  Total: number;
  AmountDue: number;
  AmountPaid: number;
  CurrencyCode: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from JWT
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Xero connection
    const { data: xeroConnection, error: connectionError } = await supabase
      .from('xero_connections')
      .select('*')
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (connectionError || !xeroConnection) {
      return new Response(
        JSON.stringify({ error: 'Xero not connected' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if token is expired and refresh if needed
    const expiresAt = new Date(xeroConnection.expires_at);
    const now = new Date();
    let accessToken = xeroConnection.access_token;

    if (expiresAt <= now) {
      const tokenResponse = await fetch('https://identity.xero.com/connect/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${Deno.env.get('XERO_CLIENT_ID')}:${Deno.env.get('XERO_CLIENT_SECRET')}`)}`,
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: xeroConnection.refresh_token,
        }),
      });

      if (!tokenResponse.ok) {
        return new Response(
          JSON.stringify({ error: 'Failed to refresh Xero token' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const tokenData = await tokenResponse.json();
      const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000);

      await supabase
        .from('xero_connections')
        .update({
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', xeroConnection.id);

      accessToken = tokenData.access_token;
    }

    // Fetch invoices from Xero
    const invoicesResponse = await fetch(
      'https://api.xero.com/api.xro/2.0/Invoices',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'xero-tenant-id': xeroConnection.tenant_id,
          'Accept': 'application/json',
        },
      }
    );

    if (!invoicesResponse.ok) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch invoices from Xero' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const invoicesData = await invoicesResponse.json();
    const invoices: XeroInvoice[] = invoicesData.Invoices || [];

    // Calculate analytics
    const now = new Date();
    const paidInvoices = invoices.filter(inv => inv.Status === 'PAID' && inv.FullyPaidOnDate);
    
    // Payment Trends Over Time (last 12 months)
    const paymentTrends: { [key: string]: { month: string; amount: number; count: number } } = {};
    const last12Months = [];
    for (let i = 11; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const monthName = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      last12Months.push(key);
      paymentTrends[key] = { month: monthName, amount: 0, count: 0 };
    }

    // Days to Payment by Client
    const clientPaymentData: { [key: string]: { 
      name: string; 
      totalDays: number; 
      count: number; 
      onTimeCount: number; 
      totalAmount: number;
    } } = {};

    // Process paid invoices
    paidInvoices.forEach((invoice) => {
      const paidDate = new Date(invoice.FullyPaidOnDate!);
      const dueDate = new Date(invoice.DueDateString);
      const invoiceDate = new Date(invoice.DateString);
      
      // Payment trends
      const monthKey = `${paidDate.getFullYear()}-${String(paidDate.getMonth() + 1).padStart(2, '0')}`;
      if (paymentTrends[monthKey]) {
        paymentTrends[monthKey].amount += invoice.Total || 0;
        paymentTrends[monthKey].count += 1;
      }

      // Client payment analytics
      const clientId = invoice.Contact?.ContactID || 'unknown';
      const clientName = invoice.Contact?.Name || 'Unknown';
      
      if (!clientPaymentData[clientId]) {
        clientPaymentData[clientId] = {
          name: clientName,
          totalDays: 0,
          count: 0,
          onTimeCount: 0,
          totalAmount: 0
        };
      }

      const daysToPayment = Math.floor((paidDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
      const isOnTime = paidDate <= dueDate;

      clientPaymentData[clientId].totalDays += daysToPayment;
      clientPaymentData[clientId].count += 1;
      clientPaymentData[clientId].totalAmount += invoice.Total || 0;
      if (isOnTime) {
        clientPaymentData[clientId].onTimeCount += 1;
      }
    });

    // Calculate client metrics
    const clientMetrics = Object.entries(clientPaymentData).map(([id, data]) => ({
      id,
      name: data.name,
      avgDaysToPayment: Math.round(data.totalDays / data.count),
      onTimeRate: Math.round((data.onTimeCount / data.count) * 100),
      reliabilityScore: Math.round(
        (data.onTimeCount / data.count) * 70 + // 70% weight on on-time payments
        (1 - Math.min(data.totalDays / data.count / 60, 1)) * 30 // 30% weight on speed
      ),
      totalPaid: data.totalAmount,
      invoiceCount: data.count
    })).sort((a, b) => b.reliabilityScore - a.reliabilityScore);

    // Seasonal Payment Patterns
    const seasonalPatterns: { [key: string]: { season: string; amount: number; count: number } } = {
      'Q1': { season: 'Q1 (Jan-Mar)', amount: 0, count: 0 },
      'Q2': { season: 'Q2 (Apr-Jun)', amount: 0, count: 0 },
      'Q3': { season: 'Q3 (Jul-Sep)', amount: 0, count: 0 },
      'Q4': { season: 'Q4 (Oct-Dec)', amount: 0, count: 0 }
    };

    paidInvoices.forEach((invoice) => {
      const paidDate = new Date(invoice.FullyPaidOnDate!);
      const month = paidDate.getMonth();
      const quarter = month < 3 ? 'Q1' : month < 6 ? 'Q2' : month < 9 ? 'Q3' : 'Q4';
      
      seasonalPatterns[quarter].amount += invoice.Total || 0;
      seasonalPatterns[quarter].count += 1;
    });

    // Cash Flow Forecasting (next 6 months based on historical patterns)
    const unpaidInvoices = invoices.filter(inv => 
      inv.Status !== 'PAID' && 
      inv.Status !== 'VOIDED'
    );

    const avgDaysToPayment = paidInvoices.length > 0
      ? paidInvoices.reduce((sum, inv) => {
          const paidDate = new Date(inv.FullyPaidOnDate!);
          const invoiceDate = new Date(inv.DateString);
          return sum + Math.floor((paidDate.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
        }, 0) / paidInvoices.length
      : 30;

    const avgMonthlyRevenue = Object.values(paymentTrends)
      .reduce((sum, trend) => sum + trend.amount, 0) / 12;

    const cashFlowForecast = [];
    for (let i = 0; i < 6; i++) {
      const forecastDate = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const monthName = forecastDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      
      // Simple forecast: average monthly revenue adjusted by seasonal patterns
      const month = forecastDate.getMonth();
      const quarter = month < 3 ? 'Q1' : month < 6 ? 'Q2' : month < 9 ? 'Q3' : 'Q4';
      const seasonalMultiplier = seasonalPatterns[quarter].count > 0
        ? (seasonalPatterns[quarter].amount / seasonalPatterns[quarter].count) / (avgMonthlyRevenue / (Object.values(paymentTrends).reduce((s, t) => s + t.count, 0) / 12))
        : 1;

      const forecastAmount = avgMonthlyRevenue * seasonalMultiplier;
      const confidence = i === 0 ? 95 : i === 1 ? 85 : i === 2 ? 75 : i === 3 ? 65 : i === 4 ? 55 : 45;

      cashFlowForecast.push({
        month: monthName,
        predicted: Math.round(forecastAmount),
        confidence,
        upperBound: Math.round(forecastAmount * 1.2),
        lowerBound: Math.round(forecastAmount * 0.8)
      });
    }

    // Overall payment health metrics
    const overallMetrics = {
      totalPaidInvoices: paidInvoices.length,
      totalRevenue: paidInvoices.reduce((sum, inv) => sum + (inv.Total || 0), 0),
      avgDaysToPayment: Math.round(avgDaysToPayment),
      onTimePaymentRate: paidInvoices.length > 0
        ? Math.round((paidInvoices.filter(inv => {
            const paidDate = new Date(inv.FullyPaidOnDate!);
            const dueDate = new Date(inv.DueDateString);
            return paidDate <= dueDate;
          }).length / paidInvoices.length) * 100)
        : 0,
      avgMonthlyRevenue: Math.round(avgMonthlyRevenue),
      totalOutstanding: unpaidInvoices.reduce((sum, inv) => sum + (inv.AmountDue || 0), 0)
    };

    return new Response(
      JSON.stringify({
        paymentTrends: last12Months.map(key => paymentTrends[key]),
        clientMetrics,
        seasonalPatterns: Object.values(seasonalPatterns),
        cashFlowForecast,
        overallMetrics
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[Analytics] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Failed to fetch analytics' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
