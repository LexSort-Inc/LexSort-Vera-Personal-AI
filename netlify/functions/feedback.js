// netlify/functions/feedback.js
// Securely forwards app feedback to the Discord webhook channel

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Vera-Token',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { 
      statusCode: 200, 
      headers, 
      body: '' 
    };
  }

  // Verify secret token to prevent abuse (outdated clients will fail and be prompted to upgrade)
  const clientToken = event.headers['x-vera-token'] || event.headers['X-Vera-Token'];
  if (clientToken !== 'vera-sovereign-intelligence-v1-token-2026') {
    console.warn('[SECURITY] Unauthorized feedback attempt without valid signature.');
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ 
        error: 'Unauthorized',
        message: 'Please update your VERA application to the latest version to submit feedback.' 
      })
    };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const data = JSON.parse(event.body || '{}');

    // Honeypot check: Bots auto-fill standard fields like "email", "url", "website", "honeypot"
    if (data.email || data.url || data.website || data.honeypot) {
      console.warn('[SECURITY] Bot honeypot triggered on feedback. Discarding.');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'success' })
      };
    }

    const { app, rating, message, version, tags } = data;
    const userMessage = message?.toLowerCase() || '';

    // Spam content moderation
    const spamKeywords = [
      'replica watch', 'crypto investment', 'quick cash', 'bitcoin profit', 
      'casino slots', 'cheap pharmacy', 'cialis', 'viagra', 'seo ranking'
    ];

    const isSpam = spamKeywords.some(keyword => userMessage.includes(keyword));

    // Block any external URLs/links to prevent abuse
    const urlMatches = userMessage.match(/https?:\/\/[^\s]+/g) || [];
    const hasLinks = urlMatches.length > 0;

    if (isSpam || hasLinks) {
      console.warn(`[SECURITY] Spam or URL filter triggered on feedback (isSpam: ${isSpam}, hasLinks: ${hasLinks}). Discarding.`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ status: 'success' })
      };
    }

    console.log(`[FEEDBACK SUBMISSION] App: ${app} | Version: ${version} | Rating: ${rating} stars`);

    const webhookUrl = process.env.DISCORD_FEEDBACK_WEBHOOK || process.env.DISCORD_WEBHOOK_URL;
    if (webhookUrl) {
      const starRating = rating > 0 ? '⭐'.repeat(rating) : 'None';
      
      // Select embed color: green for 4-5 stars, yellow for 3, red for 1-2 stars, purple default
      let color = 10181046; // Purple
      if (rating >= 4) color = 3066993; // Green
      else if (rating === 3) color = 15844367; // Yellow
      else if (rating > 0 && rating <= 2) color = 15158332; // Red

      // Format preset tags nicely if any are selected
      const formattedTags = Array.isArray(tags) && tags.length > 0
        ? tags.map(t => `• ${t}`).join('\n')
        : '*None selected*';

      const embed = {
        title: `⭐ New User Feedback: ${app || 'VERA Freeware'}`,
        color: color,
        fields: [
          { name: 'App Tier / Name', value: app || 'VERA Freeware', inline: true },
          { name: 'App Version', value: version || '1.0.0', inline: true },
          { name: 'Rating', value: `${starRating} (${rating || 0}/5)`, inline: false },
          { name: 'Selected Highlights / Preset Options', value: formattedTags, inline: false },
          { name: 'Message', value: message ? `\`\`\`${message}\`\`\`` : '*No custom message provided*', inline: false }
        ],
        timestamp: new Date().toISOString()
      };

      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ embeds: [embed] })
      }).catch(err => console.error('Failed to send feedback to Discord:', err));
    } else {
      console.warn('Warning: Webhook environment variable not configured.');
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ status: 'success' })
    };
  } catch (err) {
    console.error('Error handling feedback submission:', err);
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid Request Body' })
    };
  }
};
