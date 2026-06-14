// netlify/functions/create-tester-checkout.js
// Creates a Stripe checkout session for VERA Pro beta testers

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event, context) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { discordUserId, discordUsername, billing } = JSON.parse(event.body || '{}');

    if (!discordUserId || !discordUsername) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Discord user ID and username are required' }),
      };
    }

    // Determine the price ID based on selected billing interval (monthly or yearly)
    let priceId = process.env.STRIPE_PRO_PRICE_ID_MONTHLY;
    if (billing === 'yearly') {
      priceId = process.env.STRIPE_PRO_PRICE_ID_YEARLY;
    }
    // Fallback if specific interval variables aren't set, use original STRIPE_PRO_PRICE_ID
    if (!priceId) {
      priceId = process.env.STRIPE_PRO_PRICE_ID;
    }

    if (!priceId) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Stripe Price ID configuration is missing on the server' }),
      };
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      managed_payments: {
        enabled: true,
      },
      metadata: {
        discord_user_id: discordUserId,
        discord_username: discordUsername,
        is_beta_tester: 'true',
        source: 'discord_bot',
      },
      subscription_data: {
        metadata: {
          discord_user_id: discordUserId,
          discord_username: discordUsername,
          is_beta_tester: 'true',
        },
        trial_period_days: 14, // 2-week free trial for beta testers
      },
      success_url: `${process.env.URL}/pro-activated.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.URL}/vera-pro`,
    }, {
      apiVersion: '2026-02-25.preview'
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        checkoutUrl: session.url,
        sessionId: session.id,
      }),
    };
  } catch (error) {
    console.error('Stripe checkout error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to create checkout session', details: error.message }),
    };
  }
};
