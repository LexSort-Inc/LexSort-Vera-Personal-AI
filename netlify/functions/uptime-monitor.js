// netlify/functions/uptime-monitor.js

const BINARY_URLS = {
  mac_arm:   'https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases/download/v1.1.2/LexSort.Personal.AI_1.1.2_aarch64.dmg',
  mac_intel: 'https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases/download/v1.1.2/LexSort.Personal.AI_1.1.2_x64.dmg',
  windows:   'https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases/download/v1.1.2/LexSort.Personal.AI_1.1.2_x64_en-US.msi',
  linux_app: 'https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases/download/v1.1.2/LexSort.Personal.AI_1.1.2_amd64.AppImage',
  linux_deb: 'https://github.com/Lexsort-Core/LexSort-Vera-Personal-AI/releases/download/v1.1.2/LexSort.Personal.AI_1.1.2_amd64.deb'
};

exports.handler = async (event, context) => {
  console.log('[UPTIME MONITOR] Starting scheduled check of release binaries...');

  const results = [];
  let allHealthy = true;

  for (const [platform, url] of Object.entries(BINARY_URLS)) {
    try {
      const response = await fetch(url, { method: 'HEAD', redirect: 'follow' });
      const status = response.status;
      const healthy = status === 200;
      
      console.log(`[UPTIME MONITOR] ${platform}: HTTP ${status} | Healthy: ${healthy}`);
      
      results.push({ platform, url, status, healthy });
      if (!healthy) {
        allHealthy = false;
      }
    } catch (err) {
      console.error(`[UPTIME MONITOR] Failed to check ${platform}:`, err);
      results.push({ platform, url, status: 0, healthy: false, error: err.message });
      allHealthy = false;
    }
  }

  // Send alert to Discord if unhealthy
  const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (discordWebhookUrl && !allHealthy) {
    const statusEmoji = allHealthy ? '💚' : '🚨';
    const title = allHealthy ? 'All VERA Binaries Healthy' : 'VERA Binary Uptime Failure Alert';
    
    const embed = {
      title: `${statusEmoji} ${title}`,
      color: allHealthy ? 3066993 : 15158332,
      fields: results.map(r => ({
        name: r.platform,
        value: `[Link](${r.url}) | Status: **${r.status}** | Healthy: ${r.healthy ? 'Yes' : '❌ No'}`,
        inline: false
      })),
      timestamp: new Date().toISOString()
    };

    await fetch(discordWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ embeds: [embed] })
    }).catch(err => console.error('Failed to send uptime check to Discord:', err));
  }

  return {
    statusCode: 200,
    body: JSON.stringify({ success: allHealthy, checks: results })
  };
};
