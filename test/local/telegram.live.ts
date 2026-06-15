/**
 * Telegram smoke test. Confirms a bot token works and (optionally) sends a live
 * message, without starting the full long-poll loop. Run:
 *   TELEGRAM_BOT_TOKEN=… [TELEGRAM_CHAT_ID=…] bun test/local/telegram.live.ts
 *
 * To actually talk to your agent over Telegram, use `compass serve` instead.
 */
import { TelegramClient } from '@compass_agents/plugin-telegram'

const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN
if (!token) {
  console.error('set TELEGRAM_BOT_TOKEN (from @BotFather)')
  process.exit(1)
}

const client = new TelegramClient({ token })
const me = await client.getMe()
console.log(`✓ token valid — bot is @${me.username} (id ${me.id})`)

const chatId = process.env.TELEGRAM_CHAT_ID
if (chatId) {
  await client.sendMessage(chatId, '🧭 compass is alive. Run `compass serve` to chat with me.')
  console.log(`✓ sent a test message to chat ${chatId}`)
} else {
  console.log('set TELEGRAM_CHAT_ID to also send a test message.')
}
