// netlify/functions/verify-tester-status.js
// Verifies whether a Discord user has an active VERA Pro subscription
// Called by the Discord bot to check tester eligibility

const crypto = require('crypto');

const { generateLicenseKey } = require('./license-helper');

// Lazy Stripe client: constructed only when the paid path runs, so this
// function survives without STRIPE_SECRET_KEY (tester-allowlist path).
function stripeClient() {
  // eslint-disable-next-line global-require
  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

// Founder-managed tester allowlist (comma-separated Discord user IDs).
// Never hardcode IDs in git — set TESTER_ALLOWLIST in Netlify env.
function testerAllowlist() {
  const raw = process.env.TESTER_ALLOWLIST || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function botSharedSecret(event) {
  const headers = event.headers || {};
  return headers['x-vera-bot-secret'] || headers['X-Vera-Bot-Secret'] || null;
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

    // ── Tester-allowlist path (checked FIRST, short-circuits Stripe) ──
    // Free beta testers approved by the founder. Requires the shared bot
    // secret header so random callers can't mint keys for allowlisted IDs.
    if (testerAllowlist().includes(discordUserId)) {
      const expected = process.env.BOT_SHARED_SECRET;
      if (!expected || botSharedSecret(event) !== expected) {
        console.warn(`Tester-allowlist hit for ${discordUserId} without valid bot secret — denied.`);
        return {
          statusCode: 403,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ discordUserId, isActive: false, isBetaTester: true, testerSource: 'allowlist', error: 'Bot authentication required.' }),
        };
      }
      const expiresAt = Math.floor(Date.now() / 1000) + 90 * 24 * 60 * 60; // 90-day tester key
      const testerKey = generateLicenseKey('pro', expiresAt);
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordUserId,
          isActive: true,
          subscriptionId: null,
          licenseKey: testerKey,
          currentPeriodEnd: new Date(expiresAt * 1000).toISOString(),
          isBetaTester: true,
          testerSource: 'allowlist',
          canceledAt: null,
          cancelAt: null,
        }),
      };
    }

    // Search Stripe subscriptions for this Discord user
    const stripe = stripeClient();
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
      licenseKey = generateLicenseKey('pro', expiresAt);
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
        canceledAt: activeSubscription?.canceled_at 
          ? new Date(activeSubscription.canceled_at * 1000).toISOString() 
          : null,
        cancelAt: activeSubscription?.cancel_at 
          ? new Date(activeSubscription.cancel_at * 1000).toISOString() 
          : null,
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
