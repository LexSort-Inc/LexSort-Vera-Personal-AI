// netlify/functions/retrieve-license-key.js
// Securely retrieves/regenerates the VERA Pro license key for the success page
// Uses checkout session ID to check payment status and recreate the key

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');

const { generateLicenseKey } = require('./license-helper');

exports.handler = async (event, context) => {
  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const { session_id } = event.queryStringParameters || {};

  if (!session_id) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'session_id is required' }),
    };
  }

  try {
    // Retrieve checkout session
    const session = await stripe.checkout.sessions.retrieve(session_id, {}, {
      apiVersion: '2026-02-25.preview'
    });

    if (session.payment_status !== 'paid') {
      return {
        statusCode: 402,
        body: JSON.stringify({ error: 'Payment is not completed' }),
      };
    }

    if (!session.subscription) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No subscription found for this session' }),
      };
    }

    // Retrieve full subscription details
    const subscription = await stripe.subscriptions.retrieve(session.subscription, {}, {
      apiVersion: '2026-02-25.preview'
    });

    const discordUserId = subscription.metadata?.discord_user_id || session.metadata?.discord_user_id;
    const subscriptionId = subscription.id;

    // Calculate expiry (support new 2026-02-25.preview schema where current_period_end is nested or trial_end is used)
    const periodEnd = subscription.trial_end || 
                      subscription.items?.data?.[0]?.current_period_end || 
                      subscription.items?.data?.[0]?.billed_until ||
                      (Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60);

    const expiresAt = periodEnd + 7 * 24 * 60 * 60; // 7 days grace period

    // Generate/regenerate the license key
    const licenseKey = generateLicenseKey('pro', expiresAt);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({
        licenseKey: licenseKey,
        discordUserId: discordUserId,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
      }),
    };
  } catch (error) {
    console.error('Retrieve license key error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to retrieve license key', details: error.message }),
    };
  }
};
