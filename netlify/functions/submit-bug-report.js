// netlify/functions/submit-bug-report.js
// Securely forwards bug reports and diagnostics from VERA to the Discord Forum channel

exports.handler = async (event, context) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' }) 
    };
  }

  try {
    const { 
      platform, 
      ramGb, 
      category, 
      description, 
      diagnostics, 
      appName, 
      isPro 
    } = JSON.parse(event.body || '{}');

    const botToken = process.env.DISCORD_BOT_TOKEN;
    const forumChannelId = process.env.DISCORD_FORUM_CHANNEL_ID;

    if (!botToken || !forumChannelId) {
      console.error('Missing configuration: DISCORD_BOT_TOKEN or DISCORD_FORUM_CHANNEL_ID is not set.');
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
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

    const cTag = categoryTags[category];
    if (cTag) applied_tags.push(cTag);

    if (process.env.DISCORD_TAG_STATUS_OPEN) {
      applied_tags.push(process.env.DISCORD_TAG_STATUS_OPEN);
    }

    // Filter out undefined/null/empty strings from tags
    const cleanTags = applied_tags.filter(t => t && t.trim().length > 0);

    // ─── Format Thread Content ───────────────────────────────────────────────
    const formattedPlatform = platform ? platform.toUpperCase() : 'UNKNOWN OS';
    const formattedRam = ramGb ? `${ramGb}GB RAM` : 'UNKNOWN RAM';
    
    // Thread Title (max 100 characters in Discord)
    const rawTitle = `[${formattedPlatform} | ${formattedRam}] ${category}`;
    const threadTitle = rawTitle.length > 100 ? rawTitle.substring(0, 97) + '...' : rawTitle;

    // Embed description (handles truncation safely if description is very long)
    const userDescription = description?.trim() || '(No description provided)';
    const cleanDescription = userDescription.length > 2000 ? userDescription.substring(0, 1997) + '...' : userDescription;

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
              title: `🐛 New Bug Report — ${appName} ${isPro ? '(Pro)' : '(Freeware)'}`,
              description: `**User Report:**\n${cleanDescription}`,
              color: 0xef4444, // Red
              fields: [
                {
                  name: '🖥️ System Info',
                  value: `**Platform:** ${formattedPlatform}\n**Memory:** ${formattedRam}`,
                  inline: true,
                },
                {
                  name: '📁 Category',
                  value: category,
                  inline: true,
                },
                {
                  name: '📋 Diagnostic Details',
                  value: diagnostics ? `\`\`\`markdown\n${diagnostics}\n\`\`\`` : 'No diagnostic details attached.',
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
      headers: { 'Content-Type': 'application/json' },
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Failed to submit bug report', details: error.message }),
    };
  }
};
