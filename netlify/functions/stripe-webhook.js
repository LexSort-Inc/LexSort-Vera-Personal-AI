// netlify/functions/stripe-webhook.js
// Handles Stripe webhook events for VERA Pro subscriptions
// On successful subscription creation: generates license key + grants Discord tester role

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto');

// ─── License Key Generation ────────────────────────────────────────────────
function generateLicenseKey(discordUserId, subscriptionId, expiresAt) {
  const payload = {
    uid: discordUserId,
    sub: subscriptionId,
    exp: expiresAt,
    tier: 'pro',
    issued: Date.now(),
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  // Sign with HMAC-SHA256 using the license signing secret
  const signature = crypto
    .createHmac('sha256', process.env.LICENSE_SIGNING_SECRET)
    .update(payloadB64)
    .digest('base64url');

  // Format: VERA-XXXX-XXXX-XXXX (chunked for readability)
  const rawKey = `${payloadB64}.${signature}`;
  return `VERA-PRO-${rawKey}`;
}

// ─── Discord Role Grant via Discord API ───────────────────────────────────
async function grantDiscordTesterRole(discordUserId) {
  const guildId = process.env.DISCORD_GUILD_ID;
  const roleId = process.env.DISCORD_TESTER_ROLE_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  const response = await fetch(
    `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Discord role grant failed: ${err}`);
  }

  console.log(`✅ Granted tester role to Discord user ${discordUserId}`);
}

// ─── Send DM to Discord User ───────────────────────────────────────────────
async function sendDiscordDM(discordUserId, licenseKey) {
  const botToken = process.env.DISCORD_BOT_TOKEN;

  // Create DM channel
  const channelRes = await fetch('https://discord.com/api/v10/users/@me/channels', {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ recipient_id: discordUserId }),
  });

  if (!channelRes.ok) {
    throw new Error('Failed to create DM channel');
  }

  const channel = await channelRes.json();

  // Send DM with license key
  const msgRes = await fetch(`https://discord.com/api/v10/channels/${channel.id}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bot ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      embeds: [
        {
          title: '🎉 Welcome to VERA Pro Beta!',
          description:
            "Your subscription is active. Here is your **license key** — paste it into VERA to activate Pro features.\n\n> **Copy this key carefully. It is bound to your hardware on first use.**",
          color: 0x8b5cf6,
          fields: [
            {
              name: '🔑 Your License Key',
              value: `\`\`\`\n${licenseKey}\n\`\`\``,
              inline: false,
            },
            {
              name: '📋 How to Activate',
              value:
                '1. Open VERA on your desktop\n2. Click **Settings → Pro License**\n3. Paste your key and click **Activate**\n4. Enjoy all Pro modules! ✨',
              inline: false,
            },
          ],
          footer: {
            text: 'VERA Pro · 100% local · 0% data collection',
          },
          timestamp: new Date().toISOString(),
        },
      ],
    }),
  });

  if (!msgRes.ok) {
    const err = await msgRes.text();
    throw new Error(`Failed to send DM: ${err}`);
  }

  console.log(`✅ Sent license key DM to Discord user ${discordUserId}`);
}

// ─── Main Webhook Handler ─────────────────────────────────────────────────
exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  const sig = event.headers['stripe-signature'];
  let stripeEvent;

  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return { statusCode: 400, body: `Webhook Error: ${err.message}` };
  }

  // ── Handle subscription created / activated / checkout completed ───────
  if (
    stripeEvent.type === 'checkout.session.completed' ||
    stripeEvent.type === 'customer.subscription.created' ||
    stripeEvent.type === 'invoice.payment_succeeded'
  ) {
    let subscription;
    let discordUserId;
    let discordUsername;
    let subscriptionId;

    if (stripeEvent.type === 'checkout.session.completed') {
      const session = stripeEvent.data.object;
      discordUserId = session.metadata?.discord_user_id;
      discordUsername = session.metadata?.discord_username;
      subscriptionId = session.subscription;

      // Retrieve full subscription to check billing interval
      if (subscriptionId) {
        try {
          subscription = await stripe.subscriptions.retrieve(subscriptionId, {}, {
            apiVersion: '2026-02-25.preview'
          });
        } catch (e) {
          console.error('Failed to retrieve subscription:', e.message);
        }
      }
    } else {
      subscription = stripeEvent.data.object;
      discordUserId = subscription.metadata?.discord_user_id;
      discordUsername = subscription.metadata?.discord_username;
      subscriptionId = subscription.id;
    }

    if (!discordUserId) {
      console.log('No Discord user ID found, skipping.');
      return { statusCode: 200, body: JSON.stringify({ received: true }) };
    }

    // Calculate expiry (support new 2026-02-25.preview schema where current_period_end is nested or trial_end is used)
    let periodEnd = subscription?.trial_end || 
                    subscription?.items?.data?.[0]?.current_period_end || 
                    subscription?.items?.data?.[0]?.billed_until;

    let expiresAt;
    if (periodEnd) {
      expiresAt = periodEnd + 7 * 24 * 60 * 60; // 7 days grace period
      console.log(`Using extracted periodEnd: ${periodEnd} (+7 days grace) = ${expiresAt}`);
    } else {
      let durationDays = 30;
      try {
        let interval = subscription?.items?.data?.[0]?.plan?.interval;
        if (!interval) {
          interval = subscription?.lines?.data?.[0]?.plan?.interval;
        }
        if (interval === 'year') {
          durationDays = 365;
        }
        console.log(`Billing interval detected: ${interval || 'unknown'}, base license duration: ${durationDays} days`);
      } catch (e) {
        console.warn('Could not determine subscription interval, defaulting to 30 days:', e.message);
      }

      if (stripeEvent.type === 'customer.subscription.created' || stripeEvent.type === 'checkout.session.completed') {
        durationDays += 14; // Include 14-day free trial grace period
      }
      expiresAt = Math.floor(Date.now() / 1000) + durationDays * 24 * 60 * 60;
      console.log(`Fallback calculation expiresAt: ${expiresAt} (${durationDays} days)`);
    }

    const licenseKey = generateLicenseKey(discordUserId, subscriptionId, expiresAt);

    try {
      // Grant Discord tester role
      await grantDiscordTesterRole(discordUserId);

      // Send DM with license key
      await sendDiscordDM(discordUserId, licenseKey);

      console.log(`✅ Fully activated VERA Pro for ${discordUsername} (${discordUserId})`);
    } catch (err) {
      console.error('Post-payment automation error:', err.message);
      // Don't return 500 — Stripe would retry. Log and continue.
    }
  }

  // ── Handle subscription cancelled ─────────────────────────────────────
  if (stripeEvent.type === 'customer.subscription.deleted') {
    const subscription = stripeEvent.data.object;
    const discordUserId = subscription.metadata?.discord_user_id;
    const guildId = process.env.DISCORD_GUILD_ID;
    const roleId = process.env.DISCORD_TESTER_ROLE_ID;
    const botToken = process.env.DISCORD_BOT_TOKEN;

    if (discordUserId) {
      try {
        await fetch(
          `https://discord.com/api/v10/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bot ${botToken}` },
          }
        );
        console.log(`🔒 Revoked tester role from Discord user ${discordUserId}`);
      } catch (err) {
        console.error('Failed to revoke Discord role:', err.message);
      }
    }
  }

  return { statusCode: 200, body: JSON.stringify({ received: true }) };
};
