// netlify/functions/verify-tester-status.js
// Verifies whether a Discord user has an active VERA Pro subscription
// Called by the Discord bot to check tester eligibility

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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

    // Search Stripe subscriptions for this Discord user (both active and trialing)
    const subscriptions = await stripe.subscriptions.search({
      query: `metadata['discord_user_id']:'${discordUserId}' AND (status:'active' OR status:'trialing')`,
      limit: 5,
    });

    const hasActiveSub = subscriptions.data.length > 0;
    const activeSubscription = hasActiveSub ? subscriptions.data[0] : null;

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        discordUserId,
        isActive: hasActiveSub,
        subscriptionId: activeSubscription?.id || null,
        currentPeriodEnd: activeSubscription
          ? new Date(activeSubscription.current_period_end * 1000).toISOString()
          : null,
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
