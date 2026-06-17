// netlify/functions/submit-bug-report.js
// Securely forwards bug reports and diagnostics from VERA to the Discord Forum channel

exports.handler = async (event, context) => {
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
    console.warn('[SECURITY] Unauthorized submit-bug-report attempt without valid signature.');
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ 
        error: 'Unauthorized',
        message: 'Please update your VERA application to the latest version to submit bug reports.' 
      })
    };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers,
      body: JSON.stringify({ error: 'Method not allowed' }) 
    };
  }

  try {
    const bodyObj = JSON.parse(event.body || '{}');

    // Honeypot check: Bots auto-fill standard fields like "email", "url", "website"
    if (bodyObj.email || bodyObj.url || bodyObj.website || bodyObj.honeypot) {
      console.warn('[SECURITY] Bot honeypot triggered on submit-bug-report. Discarding.');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Bug report received.' })
      };
    }

    const userDescription = bodyObj.description?.toLowerCase() || '';
    const category = bodyObj.category?.toLowerCase() || '';
    const diagnostics = bodyObj.diagnostics?.toLowerCase() || '';

    // Spam content moderation
    const spamKeywords = [
      'replica watch', 'crypto investment', 'quick cash', 'bitcoin profit', 
      'casino slots', 'cheap pharmacy', 'cialis', 'viagra', 'seo ranking'
    ];

    const isSpam = spamKeywords.some(keyword => 
      userDescription.includes(keyword) || 
      category.includes(keyword) || 
      diagnostics.includes(keyword)
    );

    // Block any external URLs/links to prevent abuse
    const urlMatches = userDescription.match(/https?:\/\/[^\s]+/g) || [];
    const hasLinks = urlMatches.length > 0;

    if (isSpam || hasLinks) {
      console.warn(`[SECURITY] Spam or URL filter triggered (isSpam: ${isSpam}, hasLinks: ${hasLinks}). Discarding.`);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, message: 'Bug report received.' })
      };
    }

    const platform = bodyObj.platform || bodyObj.os;
    let ramGb = bodyObj.ramGb || bodyObj.ramSize;
    if (typeof ramGb === 'string') {
      const parsedRam = parseFloat(ramGb);
      ramGb = isNaN(parsedRam) ? null : parsedRam;
    }

    const { 
      freeStorageGb,
      hasNvidiaGpu,
      category: rawCategory, 
      description, 
      diagnostics: parsedDiagnostics, 
      appName, 
      isPro 
    } = bodyObj;

    const botToken = process.env.DISCORD_BOT_TOKEN;
    const forumChannelId = process.env.DISCORD_FORUM_CHANNEL_ID;

    if (!botToken || !forumChannelId) {
      console.error('Missing configuration: DISCORD_BOT_TOKEN or DISCORD_FORUM_CHANNEL_ID is not set.');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Server configuration error' }),
      };
    }

    // ─── Map to Tag IDs ──────────────────────────────────────────────────────
    const platformTags = {
      macos: process.env.DISCORD_TAG_MACOS,
      windows: process.env.DISCORD_TAG_WINDOWS,
      linux: process.env.DISCORD_TAG_LINUX
    };

    let ramTag = null;
    if (ramGb) {
      if (ramGb < 8) {
        ramTag = process.env.DISCORD_TAG_RAM_LT8;
      } else if (ramGb >= 32) {
        ramTag = process.env.DISCORD_TAG_RAM_32PLUS;
      } else {
        ramTag = process.env.DISCORD_TAG_RAM_16;
      }
    }

    const categoryTags = {
      "App won't start / crashes on launch": process.env.DISCORD_TAG_CAT_LAUNCH,
      "AI model not responding": process.env.DISCORD_TAG_CAT_INFERENCE,
      "Slow inference / high RAM usage": process.env.DISCORD_TAG_CAT_INFERENCE,
      "Download / install error": process.env.DISCORD_TAG_CAT_DOWNLOAD,
      "UI / display issue": process.env.DISCORD_TAG_CAT_UI,
      "Module error": process.env.DISCORD_TAG_CAT_MODULE,
      "Other": process.env.DISCORD_TAG_CAT_OTHER,
    };

    const applied_tags = [];

    const pTag = platformTags[platform?.toLowerCase()];
    if (pTag) applied_tags.push(pTag);

    if (ramTag) applied_tags.push(ramTag);

    const cTag = categoryTags[rawCategory];
    if (cTag) applied_tags.push(cTag);

    if (hasNvidiaGpu && process.env.DISCORD_TAG_GPU_NVIDIA) {
      applied_tags.push(process.env.DISCORD_TAG_GPU_NVIDIA);
    }

    if (freeStorageGb && freeStorageGb < 30 && process.env.DISCORD_TAG_STORAGE_LOW) {
      applied_tags.push(process.env.DISCORD_TAG_STORAGE_LOW);
    }

    if (process.env.DISCORD_TAG_STATUS_OPEN) {
      applied_tags.push(process.env.DISCORD_TAG_STATUS_OPEN);
    }

    // Filter out undefined/null/empty strings from tags
    const cleanTags = applied_tags.filter(t => t && t.trim().length > 0);

    // ─── Format Thread Content ───────────────────────────────────────────────
    const formattedPlatform = platform ? platform.toUpperCase() : 'UNKNOWN OS';
    const formattedRam = ramGb ? `${ramGb}GB RAM` : 'UNKNOWN RAM';
    
    // Thread Title (max 100 characters in Discord)
    const displayCategory = rawCategory || 'Bug Report';
    const rawTitle = `[${formattedPlatform} | ${formattedRam}] ${displayCategory}`;
    const threadTitle = rawTitle.length > 100 ? rawTitle.substring(0, 97) + '...' : rawTitle;

    // Embed description (handles truncation safely if description is very long)
    const userDescriptionText = description?.trim() || '(No description provided)';
    const cleanDescription = userDescriptionText.length > 2000 ? userDescriptionText.substring(0, 1997) + '...' : userDescriptionText;

    // Create Discord Forum Thread using REST API
    const discordUrl = `https://discord.com/api/v10/channels/${forumChannelId}/threads`;
    
    const response = await fetch(discordUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bot ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: threadTitle,
        auto_archive_duration: 10080, // 7 days active
        applied_tags: cleanTags,
        message: {
          embeds: [
            {
              title: `🐛 New Bug Report — ${appName || 'VERA'} ${isPro ? '(Pro)' : '(Freeware)'}`,
              description: `**User Report:**\n${cleanDescription}`,
              color: 0xef4444, // Red
              fields: [
                {
                  name: '🖥️ System Info',
                  value: `**Platform:** ${formattedPlatform}\n**Memory:** ${formattedRam}\n**Storage Avail:** ${freeStorageGb ? `${freeStorageGb}GB` : 'UNKNOWN'}\n**NVIDIA GPU:** ${hasNvidiaGpu ? 'YES' : 'NO'}`,
                  inline: true,
                },
                {
                  name: '📁 Category',
                  value: displayCategory,
                  inline: true,
                },
                {
                  name: '📋 Diagnostic Details',
                  value: parsedDiagnostics ? `\`\`\`markdown\n${parsedDiagnostics}\n\`\`\`` : 'No diagnostic details attached.',
                  inline: false,
                }
              ],
              timestamp: new Date().toISOString(),
              footer: {
                text: 'VERA Support System · Direct App Submit'
              }
            }
          ]
        }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Discord API error:', errorText);
      throw new Error(`Discord API returned status ${response.status}: ${errorText}`);
    }

    const threadData = await response.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        threadId: threadData.id,
        threadUrl: `https://discord.com/channels/${process.env.DISCORD_GUILD_ID}/${threadData.id}`
      }),
    };

  } catch (error) {
    console.error('Submit bug report error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to submit bug report', details: error.message }),
    };
  }
};
