// netlify/functions/verify-tester-status.js
// Verifies whether a Discord user has an active VERA Pro subscription
// Called by the Discord bot to check tester eligibility

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');

function generateLicenseKey(discordUserId, subscriptionId, expiresAt) {
  const payload = {
    uid: discordUserId || 'web_customer',
    sub: subscriptionId,
    exp: expiresAt,
    tier: 'pro',
    issued: Date.now(),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signature = crypto
    .createHmac('sha256', process.env.LICENSE_SIGNING_SECRET || '')
    .update(payloadB64)
    .digest('base64url');

  return `VERA-PRO-${payloadB64}.${signature}`;
}

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'GET' && event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    let discordUserId;

    if (event.httpMethod === 'GET') {
      discordUserId = event.queryStringParameters?.discord_user_id;
    } else {
      const body = JSON.parse(event.body || '{}');
      discordUserId = body.discordUserId;
    }

    if (!discordUserId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'discord_user_id is required' }),
      };
    }

    // Search Stripe subscriptions for this Discord user
    const subscriptions = await stripe.subscriptions.search({
      query: `metadata['discord_user_id']:'${discordUserId}'`,
      limit: 5,
    });

    const activeSubscription = subscriptions.data.find(sub => sub.status === 'active' || sub.status === 'trialing') || null;
    const hasActiveSub = activeSubscription !== null;

    let licenseKey = null;
    let currentPeriodEnd = null;

    if (activeSubscription) {
      const periodEnd = activeSubscription.trial_end || 
                        activeSubscription.items?.data?.[0]?.current_period_end || 
                        activeSubscription.items?.data?.[0]?.billed_until ||
                        activeSubscription.current_period_end ||
                        (Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);

      const expiresAt = periodEnd + 7 * 24 * 60 * 60; // 7 days grace period
      licenseKey = generateLicenseKey(discordUserId, activeSubscription.id, expiresAt);
      currentPeriodEnd = new Date(periodEnd * 1000).toISOString();
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discordUserId,
        isActive: hasActiveSub,
        subscriptionId: activeSubscription?.id || null,
        licenseKey: licenseKey,
        currentPeriodEnd: currentPeriodEnd,
        isBetaTester: activeSubscription?.metadata?.is_beta_tester === 'true',
      }),
    };
  } catch (error) {
    console.error('Verify tester status error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error', details: error.message }),
    };
  }
};
