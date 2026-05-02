const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

// Token Railway Variables se lega
const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

const users = {};

function randomString(len = 10) {
  return Math.random().toString(36).substring(2, 2 + len);
}

async function getDomain() {
  const res = await fetch("https://api.mail.tm/domains");
  const data = await res.json();
  return data["hydra:member"][0].domain;
}

async function createEmail() {
  const domain = await getDomain();
  const address = randomString(12) + "@" + domain;
  const password = randomString(16);
  
  await fetch("https://api.mail.tm/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password })
  });
  
  const tokenRes = await fetch("https://api.mail.tm/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password })
  });
  const tokenData = await tokenRes.json();
  
  return { email: address, token: tokenData.token };
}

async function getInbox(token) {
  const res = await fetch("https://api.mail.tm/messages", {
    headers: { "Authorization": `Bearer ${token}` }
  });
  const data = await res.json();
  return data["hydra:member"] || [];
}

async function getMessage(token, id) {
  const res = await fetch(`https://api.mail.tm/messages/${id}`, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  return await res.json();
}

bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 
    "🤖 *Temp Mail Bot*\n\nCommands:\n/new - Create email\n/inbox - Check messages\n/me - My email\n/delete - Delete email\n/otp - Find OTP\n/help - Help", 
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/help/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 
    "📧 *Commands:*\n/new - New email\n/inbox - Check messages\n/me - Show email\n/delete - Delete email\n/otp - Find OTP codes\n/read 1 - Read message", 
    { parse_mode: "Markdown" }
  );
});

bot.onText(/\/new/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (users[chatId]) {
    await bot.sendMessage(chatId, "⚠️ Use /delete first to create new email.");
    return;
  }
  
  await bot.sendMessage(chatId, "⏳ Creating email...");
  
  try {
    const { email, token } = await createEmail();
    users[chatId] = { email, token };
    await bot.sendMessage(chatId, 
      `✅ *Email created!*\n\n\`${email}\`\n\nUse /inbox to check.`, 
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    await bot.sendMessage(chatId, "❌ Failed. Try again.");
  }
});

bot.onText(/\/me/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!users[chatId]) {
    await bot.sendMessage(chatId, "❌ No email. Use /new.");
    return;
  }
  
  await bot.sendMessage(chatId, `📧 \`${users[chatId].email}\``, { parse_mode: "Markdown" });
});

bot.onText(/\/inbox/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!users[chatId]) {
    await bot.sendMessage(chatId, "❌ Use /new first.");
    return;
  }
  
  await bot.sendMessage(chatId, "📥 Checking...");
  
  try {
    const messages = await getInbox(users[chatId].token);
    
    if (messages.length === 0) {
      await bot.sendMessage(chatId, "📭 No messages.");
      return;
    }
    
    users[chatId].messages = messages;
    
    let reply = `📬 *${messages.length} message(s):*\n\n`;
    for (let i = 0; i < Math.min(messages.length, 5); i++) {
      reply += `${i+1}. From: ${messages[i].from.address}\n`;
      reply += `   ${messages[i].subject || "No subject"}\n\n`;
    }
    reply += `Type /read 1 to read`;
    
    await bot.sendMessage(chatId, reply, { parse_mode: "Markdown" });
  } catch (error) {
    await bot.sendMessage(chatId, "❌ Error.");
  }
});

bot.onText(/\/read (\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const num = parseInt(match[1]) - 1;
  
  if (!users[chatId] || !users[chatId].messages) {
    await bot.sendMessage(chatId, "❌ Use /inbox first.");
    return;
  }
  
  if (!users[chatId].messages[num]) {
    await bot.sendMessage(chatId, "❌ Invalid number.");
    return;
  }
  
  try {
    const msgData = await getMessage(users[chatId].token, users[chatId].messages[num].id);
    let text = msgData.text || "No content";
    if (text.length > 800) text = text.substring(0, 800) + "...";
    
    await bot.sendMessage(chatId, 
      `📩 *From:* ${msgData.from.address}\n*Subject:* ${msgData.subject || "No subject"}\n\n${text}`,
      { parse_mode: "Markdown" }
    );
  } catch (error) {
    await bot.sendMessage(chatId, "❌ Failed to read.");
  }
});

bot.onText(/\/otp/, async (msg) => {
  const chatId = msg.chat.id;
  
  if (!users[chatId]) {
    await bot.sendMessage(chatId, "❌ Use /new first.");
    return;
  }
  
  await bot.sendMessage(chatId, "🔍 Searching OTP...");
  
  try {
    const messages = await getInbox(users[chatId].token);
    let codes = [];
    
    for (let msg of messages.slice(0, 5)) {
      const msgData = await getMessage(users[chatId].token, msg.id);
      const text = msgData.text || "";
      const found = text.match(/\b\d{4,8}\b/g);
      if (found) codes.push(...found);
    }
    
    if (codes.length > 0) {
      await bot.sendMessage(chatId, `🔐 *OTP Codes:*\n${codes.join("\n")}`, { parse_mode: "Markdown" });
    } else {
      await bot.sendMessage(chatId, "🔍 No OTP found.");
    }
  } catch (error) {
    await bot.sendMessage(chatId, "❌ Error.");
  }
});

bot.onText(/\/delete/, async (msg) => {
  const chatId = msg.chat.id;
  delete users[chatId];
  await bot.sendMessage(chatId, "🗑 Email deleted! Use /new to create.");
});

bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  if (msg.text && !msg.text.startsWith("/")) {
    bot.sendMessage(chatId, "Use /new for temp email, /inbox for messages");
  }
});

console.log("🤖 Bot is running...");
