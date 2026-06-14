// discord-bot/tester-manager.js
// VERA Pro Beta Tester Manager Bot
// Commands:
//   /register   — Start VERA Pro checkout as a beta tester
//   /mystatus   — Check your subscription status
//   /help       — Show available commands

require('dotenv').config();
const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const NETLIFY_BASE_URL = process.env.NETLIFY_SITE_URL; // e.g. https://lexsort.com

// ─── Slash Command Definitions ────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('register')
    .setDescription('Start your VERA Pro beta subscription (14-day free trial)')
    .addStringOption(option =>
      option
        .setName('billing')
        .setDescription('Billing interval (Monthly vs. Yearly)')
        .setRequired(true)
        .addChoices(
          { name: 'Monthly ($5.99/mo)', value: 'monthly' },
          { name: 'Yearly ($59.00/yr)', value: 'yearly' }
        )
    )
    .toJSON(),

  new SlashCommandBuilder()
    .setName('mystatus')
    .setDescription('Check if your VERA Pro subscription is active')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('mykey')
    .setDescription('Request your VERA Pro license key be resent to you via DM')
    .toJSON(),

  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show VERA Pro beta tester commands')
    .toJSON(),
];

// ─── Register Slash Commands ──────────────────────────────────────────────
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
  try {
    console.log('📡 Registering slash commands...');
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Slash commands registered.');
  } catch (error) {
    console.error('❌ Failed to register commands:', error);
  }
}

// ─── Discord Client ───────────────────────────────────────────────────────
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

const { initApprovalBot } = require('./approval-bot.js');

// Initialize approval bot (runs HTTP server immediately)
initApprovalBot(client);

client.once('ready', () => {
  console.log(`✅ VERA Tester Bot is online as ${client.user.tag}`);
});

// ─── Rate Limiter ─────────────────────────────────────────────────────────
const rateLimits = new Map();

function checkRateLimit(userId, commandName) {
  const key = `${userId}:${commandName}`;
  const now = Date.now();
  const lastTime = rateLimits.get(key) || 0;
  const cooldown = 5000; // 5 seconds

  if (now - lastTime < cooldown) {
    return false;
  }
  rateLimits.set(key, now);
  return true;
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, user } = interaction;

  if (!checkRateLimit(user.id, commandName)) {
    return interaction.reply({
      content: '⏳ Please wait a few seconds before using this command again.',
      ephemeral: true,
    });
  }

  // ── /register ────────────────────────────────────────────────────────
  if (commandName === 'register') {
    await interaction.deferReply({ ephemeral: true });

    try {
      const billing = interaction.options.getString('billing') || 'monthly';
      const response = await fetch(`${NETLIFY_BASE_URL}/.netlify/functions/create-tester-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discordUserId: user.id,
          discordUsername: user.username,
          billing: billing,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.checkoutUrl) {
        throw new Error(data.error || 'Unknown error');
      }

      const priceText = billing === 'yearly'
        ? '$59.00/year · Cancel anytime · 14-day free trial'
        : '$5.99/month · Cancel anytime · 14-day free trial';

      const embed = new EmbedBuilder()
        .setTitle('🚀 Start Your VERA Pro Beta Access')
        .setDescription(
          `Please click the link below to begin your secure Stripe checkout:\n\n👉 **[🔐 Begin Secure Checkout](${data.checkoutUrl})**\n\n**What happens next:**\n1. Complete checkout (14-day free trial)\n2. I'll DM you your license key automatically\n3. Your **Beta Tester** role will be granted instantly\n\n> 🔒 VERA never sees your email — Stripe handles payments only.`
        )
        .setColor(0x8b5cf6)
        .addFields({
          name: '💰 Pricing',
          value: priceText,
          inline: false,
        })
        .setFooter({ text: 'VERA Pro · 100% local AI · 0% data collection' })
        .setTimestamp();

      const components = [];
      if (data.checkoutUrl.length <= 512) {
        components.push({
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              style: 5, // Link
              label: '🔐 Begin Secure Checkout',
              url: data.checkoutUrl,
            },
          ],
        });
      }

      await interaction.editReply({
        embeds: [embed],
        components: components,
      });
    } catch (error) {
      console.error('/register error:', error);
      await interaction.editReply({
        content: `❌ Something went wrong: ${error.message}. Please try again or ping a moderator.`,
      });
    }
  }

  // ── /mystatus ─────────────────────────────────────────────────────────
  if (commandName === 'mystatus') {
    await interaction.deferReply({ ephemeral: true });

    try {
      const response = await fetch(
        `${NETLIFY_BASE_URL}/.netlify/functions/verify-tester-status?discord_user_id=${user.id}`
      );
      const data = await response.json();

      if (data.isActive) {
        const embed = new EmbedBuilder()
          .setTitle('✅ VERA Pro — Active Subscription')
          .setColor(0x10b981)
          .addFields(
            { name: 'Status', value: '🟢 Active', inline: true },
            { name: 'Beta Tester', value: data.isBetaTester ? '✅ Yes' : '❌ No', inline: true },
            {
              name: 'Renews',
              value: data.currentPeriodEnd
                ? `<t:${Math.floor(new Date(data.currentPeriodEnd).getTime() / 1000)}:R>`
                : 'Unknown',
              inline: true,
            }
          )
          .setFooter({ text: 'Use /mykey to resend your license key' });

        await interaction.editReply({ embeds: [embed] });
      } else {
        const embed = new EmbedBuilder()
          .setTitle('❌ No Active VERA Pro Subscription')
          .setDescription(
            "You don't have an active subscription. Use **/register** to get started with your 14-day free trial!"
          )
          .setColor(0xef4444);

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('/mystatus error:', error);
      await interaction.editReply({ content: `❌ Error checking status: ${error.message}` });
    }
  }

  // ── /mykey ────────────────────────────────────────────────────────────
  if (commandName === 'mykey') {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Verify active subscription first
      const response = await fetch(
        `${NETLIFY_BASE_URL}/.netlify/functions/verify-tester-status?discord_user_id=${user.id}`
      );
      const data = await response.json();

      if (!data.isActive) {
        await interaction.editReply({
          content: '❌ You need an active VERA Pro subscription to request a key. Use **/register** to get started.',
        });
        return;
      }

      // Keys are sent via DM during checkout — direct them to check DMs
      await interaction.editReply({
        content:
          '📬 Your license key was sent to you via DM when you subscribed. Please check your Discord DMs from this bot.\n\nIf you need a new key (e.g., new hardware), please open a support ticket in <#support> and a moderator will assist you.',
      });
    } catch (error) {
      await interaction.editReply({ content: `❌ Error: ${error.message}` });
    }
  }

  // ── /help ─────────────────────────────────────────────────────────────
  if (commandName === 'help') {
    const embed = new EmbedBuilder()
      .setTitle('🤖 VERA Pro Beta Bot — Commands')
      .setColor(0x8b5cf6)
      .addFields(
        {
          name: '/register',
          value: 'Start your VERA Pro beta subscription with a 14-day free trial',
          inline: false,
        },
        {
          name: '/mystatus',
          value: 'Check if your subscription is active and when it renews',
          inline: false,
        },
        {
          name: '/mykey',
          value: 'Get help retrieving your license key',
          inline: false,
        },
        {
          name: 'Need help?',
          value: 'Post in <#pro-bug-reports> for bugs or <#pro-feedback> for suggestions.',
          inline: false,
        }
      )
      .setFooter({ text: 'VERA Pro · $5.99/mo · 100% local AI' });

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
});

// ─── Boot ─────────────────────────────────────────────────────────────────
(async () => {
  await registerCommands();
  await client.login(BOT_TOKEN);
})();
