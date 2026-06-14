// discord-bot/approval-bot.js
// Handles GitHub webhook events, moderator approvals in Discord,
// and automated publishing to Discord announcements and Reddit r/LexSort.

const http = require('http');
const crypto = require('crypto');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');

// Map to store pending releases in-memory
const pendingReleases = new Map();

// Helper to post to Reddit API using native fetch
async function postToReddit(title, body) {
  const client_id = process.env.REDDIT_CLIENT_ID;
  const client_secret = process.env.REDDIT_CLIENT_SECRET;
  const username = process.env.REDDIT_USERNAME;
  const password = process.env.REDDIT_PASSWORD;
  const subreddit = process.env.REDDIT_SUBREDDIT || 'LexSort';

  if (!client_id || !client_secret || !username || !password) {
    console.warn('⚠️ Reddit credentials missing, skipping Reddit post.');
    return null;
  }

  const basicAuth = Buffer.from(`${client_id}:${client_secret}`).toString('base64');
  
  // 1. Get access token
  const tokenRes = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': `VERA-Bot/1.0.0 (by /u/${username})`
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: username,
      password: password
    })
  });

  if (!tokenRes.ok) {
    const errorText = await tokenRes.text();
    throw new Error(`Reddit auth failed: ${errorText}`);
  }

  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;

  // 2. Submit post
  const submitRes = await fetch('https://oauth.reddit.com/api/submit', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': `VERA-Bot/1.0.0 (by /u/${username})`
    },
    body: new URLSearchParams({
      sr: subreddit,
      kind: 'self',
      title: title,
      text: body
    })
  });

  if (!submitRes.ok) {
    const errorText = await submitRes.text();
    throw new Error(`Reddit submission failed: ${errorText}`);
  }

  return await submitRes.json();
}

function verifySignature(body, signature, secret) {
  if (!signature || !secret) return false;
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(body).digest('hex');
  
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
  } catch (err) {
    return false;
  }
}

function initApprovalBot(client) {
  const PORT = process.env.PORT || 3000;
  const WEBHOOK_SECRET = process.env.GITHUB_WEBHOOK_SECRET;
  const APPROVALS_CHANNEL_ID = process.env.DISCORD_APPROVALS_CHANNEL_ID;
  const ANNOUNCEMENTS_CHANNEL_ID = process.env.DISCORD_ANNOUNCEMENTS_CHANNEL_ID;

  // ─── 1. Webhook Server ──────────────────────────────────────────────────
  const server = http.createServer((req, res) => {
    // ─── Health Check ───────────────────────────────────────────────────────
    if (req.url === '/health' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          status: 'ok',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        })
      );
    }

    if (req.method !== 'POST') {
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      return res.end('Method not allowed');
    }

    let body = '';
    req.on('data', chunk => {
      body += chunk;
    });

    req.on('end', async () => {
      // Verify signature if secret is defined
      if (WEBHOOK_SECRET) {
        const signature = req.headers['x-hub-signature-256'];
        if (!verifySignature(body, signature, WEBHOOK_SECRET)) {
          console.warn('⚠️ GitHub Webhook signature verification failed');
          res.writeHead(401, { 'Content-Type': 'text/plain' });
          return res.end('Unauthorized');
        }
      }

      try {
        const payload = JSON.parse(body);
        
        // We only care about published releases
        if (payload.action === 'published' && payload.release) {
          const release = payload.release;
          const releaseKey = release.tag_name;
          
          console.log(`📦 Received GitHub release event for tag: ${releaseKey}`);
          
          // Store release info in-memory
          pendingReleases.set(releaseKey, {
            title: release.name || release.tag_name,
            body: release.body || '',
            url: release.html_url,
            tag: releaseKey
          });

          // Send approval prompt to Discord approvals channel
          const approvalsChannel = await client.channels.fetch(APPROVALS_CHANNEL_ID);
          if (approvalsChannel) {
            const embed = new EmbedBuilder()
              .setTitle(`🔍 Pending Release Approval: ${release.name || release.tag_name}`)
              .setDescription(
                `A new release has been drafted/published on GitHub and is pending moderation approval.\n\n**Release Description:**\n${(release.body || 'No description provided.').slice(0, 1000)}`
              )
              .setColor(0xeab308) // Yellow status
              .addFields(
                { name: 'Tag', value: release.tag_name, inline: true },
                { name: 'GitHub Link', value: `[View on GitHub](${release.html_url})`, inline: true }
              )
              .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId(`approve_release:${releaseKey}`)
                .setLabel('🚀 Approve & Broadcast')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId(`reject_release:${releaseKey}`)
                .setLabel('❌ Reject')
                .setStyle(ButtonStyle.Danger)
            );

            await approvalsChannel.send({ embeds: [embed], components: [row] });
            console.log(`📡 Posted approval request for ${releaseKey} to #${approvalsChannel.name}`);
          } else {
            console.error(`❌ Could not find approvals channel: ${APPROVALS_CHANNEL_ID}`);
          }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ received: true }));
      } catch (err) {
        console.error('❌ Error processing webhook payload:', err);
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Bad Request');
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`🚀 Webhook HTTP Server is running on port ${PORT}`);
  });

  // ─── 2. Discord Interaction Handler ──────────────────────────────────────
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const [action, releaseKey] = interaction.customId.split(':');
    if (action !== 'approve_release' && action !== 'reject_release') return;

    // Verify moderator privileges (requires administrator)
    if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({
        content: '⚠️ You do not have permission to approve/reject releases.',
        ephemeral: true
      });
    }

    await interaction.deferUpdate();

    const release = pendingReleases.get(releaseKey);

    if (action === 'approve_release') {
      if (!release) {
        return interaction.followUp({
          content: '❌ Release data has expired or is no longer pending in memory.',
          ephemeral: true
        });
      }

      try {
        // 1. Post to Discord Announcements channel
        const announcementsChannel = await client.channels.fetch(ANNOUNCEMENTS_CHANNEL_ID);
        if (announcementsChannel) {
          const annEmbed = new EmbedBuilder()
            .setTitle(`🚀 VERA New Release: ${release.title}`)
            .setDescription(release.body)
            .setURL(release.url)
            .setColor(0x8b5cf6) // Purple theme
            .addFields({ name: 'Installation', value: 'Restart your VERA desktop client to auto-update.' })
            .setFooter({ text: 'VERA · Private, secure local AI' })
            .setTimestamp();

          await announcementsChannel.send({ content: '@everyone', embeds: [annEmbed] });
          console.log(`✅ Broadcasted release ${releaseKey} to #${announcementsChannel.name}`);
        } else {
          console.error(`❌ Could not find announcements channel: ${ANNOUNCEMENTS_CHANNEL_ID}`);
        }

        // 2. Post to Reddit (r/LexSort)
        try {
          const redditRes = await postToReddit(
            `🚀 VERA Release: ${release.title}`,
            `${release.body}\n\n[Release on GitHub](${release.url})`
          );
          if (redditRes) {
            console.log('✅ Published release announcement to Reddit r/LexSort');
          }
        } catch (redditErr) {
          console.error('❌ Failed to publish release announcement to Reddit:', redditErr.message);
          await interaction.followUp({
            content: `⚠️ Release approved and broadcasted to Discord, but Reddit post failed: ${redditErr.message}`,
            ephemeral: true
          });
        }

        // 3. Update the prompt message in approvals channel
        const approvedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x22c55e) // Green status
          .setTitle(`✅ Approved: ${release.title}`)
          .setDescription(`Approved and broadcasted by **${interaction.user.username}**.\n\n**Release Description:**\n${release.body.slice(0, 1000)}`);

        await interaction.editReply({ embeds: [approvedEmbed], components: [] });
        pendingReleases.delete(releaseKey);

      } catch (err) {
        console.error('❌ Release approval sequence failed:', err);
        await interaction.followUp({
          content: `❌ An error occurred while executing the approval pipeline: ${err.message}`,
          ephemeral: true
        });
      }
    } else if (action === 'reject_release') {
      const rejectedEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor(0xef4444) // Red status
        .setTitle(`❌ Rejected: ${releaseKey}`)
        .setDescription(`Rejected by **${interaction.user.username}**.`);

      await interaction.editReply({ embeds: [rejectedEmbed], components: [] });
      pendingReleases.delete(releaseKey);
      console.log(`❌ Release ${releaseKey} was rejected by moderator ${interaction.user.username}`);
    }
  });
}

module.exports = {
  initApprovalBot
};
