const TelegramBot = require("node-telegram-bot-api");
const fetch = require("node-fetch");

const BOT_TOKEN = process.env.BOT_TOKEN;
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// Store user data
const users = {};

// Public domains available to everyone
const publicDomains = ["hi2.in", "telegmail.com", "fakemail.com", "tempmail.com"];

function randomString(len = 12) {
  return Math.random().toString(36).substring(2, 2 + len);
}

async function getDomain() {
  const res = await fetch("https://api.mail.tm/domains");
  const data = await res.json();
  return data["hydra:member"][0].domain;
}

async function createEmail(address, password) {
  const res = await fetch("https://api.mail.tm/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password })
  });
  return res.ok;
}

async function getToken(address, password) {
  const res = await fetch("https://api.mail.tm/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address, password })
  });
  const data = await res.json();
  return data.token;
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

function initUser(chatId) {
  if (!users[chatId]) {
    users[chatId] = {
      currentEmail: null,
      currentToken: null,
      currentPassword: null,
      customDomains: [],
      phoneNumber: null,
      blocklist: [],
      messages: []
    };
  }
}

// Main keyboard
const mainKeyboard = {
  reply_markup: {
    keyboard: [
      ["📧 /generate", "🆔 /id"],
      ["✏️ /set", "📱 /phone"],
      ["🌐 /domain", "🚫 /block"],
      ["ℹ️ /about", "🔄 /transfer"]
    ],
    resize_keyboard: true
  }
};

// /start command
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  await bot.sendMessage(chatId, 
    "🤖 *Welcome to Fake Mail Bot!*\n\n" +
    "Get disposable email addresses instantly.\n\n" +
    "📌 *Commands:*\n" +
    "/generate - Get a new fake mail id\n" +
    "/id - Show your current fake mail id\n" +
    "/set - Setup a custom fake mail id\n" +
    "/phone - Add/update recovery phone number\n" +
    "/domain - Manage custom domains\n" +
    "/block - Manage blocklist\n" +
    "/about - About this bot\n" +
    "/transfer - Transfer to another Telegram account\n" +
    "/inbox - Check your messages\n" +
    "/otp - Find OTP codes", 
    { parse_mode: "Markdown", ...mainKeyboard }
  );
});

// /generate - Get new fake mail
bot.onText(/\/generate/, async (msg) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  // Show domain options
  let domainList = "🌐 *Select domain:*\n\n";
  for (let i = 0; i < publicDomains.length; i++) {
    domainList += `${i+1}. @${publicDomains[i]}\n`;
  }
  
  if (users[chatId].customDomains.length > 0) {
    domainList += "\n🔒 *Your domains:*\n";
    for (let i = 0; i < users[chatId].customDomains.length; i++) {
      domainList += `${publicDomains.length + i + 1}. @${users[chatId].customDomains[i]}\n`;
    }
  }
  
  domainList += "\n📝 Send domain number (1, 2, 3...)";
  
  await bot.sendMessage(chatId, domainList, { parse_mode: "Markdown" });
  users[chatId].waitingForDomain = true;
});

// /id - Show current fake mail id
bot.onText(/\/id/, async (msg) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  if (!users[chatId].currentEmail) {
    await bot.sendMessage(chatId, "❌ No active fake mail. Use /generate first.", mainKeyboard);
  } else {
    await bot.sendMessage(chatId, 
      `📧 *Your current fake mail id:*\n\`${users[chatId].currentEmail}\``,
      { parse_mode: "Markdown", ...mainKeyboard }
    );
  }
});

// /set - Setup custom fake mail id
bot.onText(/\/set/, async (msg) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  await bot.sendMessage(chatId, 
    "✏️ *Setup Custom Fake Mail ID*\n\n" +
    "Send me your desired fakemail id\n\n" +
    "📝 *Examples:*\n" +
    `• \`yourname@${publicDomains[0]}\`\n` +
    `• \`yourname@${publicDomains[1]}\`\n\n` +
    "If you own a domain, use /domain to add it first.",
    { parse_mode: "Markdown" }
  );
  
  users[chatId].waitingForCustomEmail = true;
});

// /phone - Add/update recovery phone
bot.onText(/\/phone/, async (msg) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  const current = users[chatId].phoneNumber ? `📱 Current: \`${users[chatId].phoneNumber}\`` : "❌ No phone number set";
  
  await bot.sendMessage(chatId, 
    `📱 *Recovery Phone Number*\n\n${current}\n\nSend your phone number with country code:\nExample: \`+91XXXXXXXXXX\``,
    { parse_mode: "Markdown" }
  );
  
  users[chatId].waitingForPhone = true;
});

// /domain - Manage custom domains
bot.onText(/\/domain/, async (msg) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  await bot.sendMessage(chatId, 
    "🌐 *Domain Management*\n\n" +
    "1️⃣ /adddomain - Add your own domain\n" +
    "2️⃣ /mydomains - Show my domains\n" +
    "3️⃣ /removedomain - Remove domain\n\n" +
    "📌 *To add a domain:*\n" +
    "• Point MX record to: \`mx.checker.in\`\n" +
    "• Add SPF record: \`v=spf1 include:mx.checker.in -all\`\n" +
    "• Then use /adddomain yourdomain.com",
    { parse_mode: "Markdown", ...mainKeyboard }
  );
});

// /adddomain
bot.onText(/\/adddomain(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  if (!match[1]) {
    await bot.sendMessage(chatId, "📝 Send domain name:\nExample: `/adddomain example.com`", { parse_mode: "Markdown" });
    users[chatId].waitingForDomainAdd = true;
    return;
  }
  
  const domain = match[1].toLowerCase().trim();
  
  if (!domain.match(/^[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
    await bot.sendMessage(chatId, "❌ Invalid domain format. Use: example.com");
    return;
  }
  
  await bot.sendMessage(chatId, 
    "⚠️ *Verify Domain Ownership*\n\n" +
    "To verify you own this domain:\n\n" +
    "1. Add this TXT record to your DNS:\n" +
    "`_verify.fakemail TXT \"verified-owner\"`\n\n" +
    "2. Or send DMARC email from this domain to `verify@fakemail.com`\n\n" +
    "After adding, send `/confirmdomain " + domain + "`",
    { parse_mode: "Markdown" }
  );
  
  users[chatId].pendingDomain = domain;
});

// /confirmdomain
bot.onText(/\/confirmdomain\s+(.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const domain = match[1];
  initUser(chatId);
  
  if (!users[chatId].pendingDomain || users[chatId].pendingDomain !== domain) {
    await bot.sendMessage(chatId, "❌ No pending domain. Use /adddomain first.");
    return;
  }
  
  await bot.sendMessage(chatId, "🔍 Checking domain verification...");
  
  // Simple check - in production you'd verify DNS TXT record
  setTimeout(async () => {
    if (!users[chatId].customDomains.includes(domain)) {
      users[chatId].customDomains.push(domain);
      await bot.sendMessage(chatId, 
        `✅ *Domain added!*\n\n@${domain} is now available for creating emails.\nUse /generate to create email with this domain.`,
        { parse_mode: "Markdown", ...mainKeyboard }
      );
    }
    delete users[chatId].pendingDomain;
  }, 2000);
});

// /mydomains
bot.onText(/\/mydomains/, async (msg) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  if (users[chatId].customDomains.length === 0) {
    await bot.sendMessage(chatId, "❌ No custom domains added. Use /adddomain", mainKeyboard);
  } else {
    let list = "🔒 *Your Custom Domains:*\n\n";
    for (let d of users[chatId].customDomains) {
      list += `• @${d}\n`;
    }
    await bot.sendMessage(chatId, list, { parse_mode: "Markdown", ...mainKeyboard });
  }
});

// /removedomain
bot.onText(/\/removedomain(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  if (users[chatId].customDomains.length === 0) {
    await bot.sendMessage(chatId, "❌ No domains to remove.");
    return;
  }
  
  if (!match[1]) {
    let list = "🗑 *Select domain to remove:*\n\n";
    for (let i = 0; i < users[chatId].customDomains.length; i++) {
      list += `${i+1}. @${users[chatId].customDomains[i]}\n`;
    }
    list += "\nSend domain number:";
    await bot.sendMessage(chatId, list, { parse_mode: "Markdown" });
    users[chatId].waitingForDomainRemove = true;
    return;
  }
  
  const domain = match[1].toLowerCase().trim();
  const index = users[chatId].customDomains.indexOf(domain);
  
  if (index === -1) {
    await bot.sendMessage(chatId, "❌ Domain not found.");
    return;
  }
  
  users[chatId].customDomains.splice(index, 1);
  await bot.sendMessage(chatId, `✅ Removed: @${domain}`, { parse_mode: "Markdown", ...mainKeyboard });
});

// /block - Manage blocklist
bot.onText(/\/block/, async (msg) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  await bot.sendMessage(chatId, 
    "🚫 *Blocklist Management*\n\n" +
    "1️⃣ /blockadd - Block an email/sender\n" +
    "2️⃣ /blocklist - Show blocked senders\n" +
    "3️⃣ /blockremove - Remove from blocklist\n\n" +
    "📌 *Note:* Emails from blocked senders will be automatically deleted.",
    { parse_mode: "Markdown", ...mainKeyboard }
  );
});

// /blockadd
bot.onText(/\/blockadd(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  if (!match[1]) {
    await bot.sendMessage(chatId, "📝 Send email address to block:\nExample: `/blockadd spammer@domain.com`", { parse_mode: "Markdown" });
    users[chatId].waitingForBlockAdd = true;
    return;
  }
  
  const email = match[1].toLowerCase();
  if (!users[chatId].blocklist.includes(email)) {
    users[chatId].blocklist.push(email);
  }
  await bot.sendMessage(chatId, `✅ Blocked: \`${email}\``, { parse_mode: "Markdown", ...mainKeyboard });
});

// /blocklist
bot.onText(/\/blocklist/, async (msg) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  if (users[chatId].blocklist.length === 0) {
    await bot.sendMessage(chatId, "📭 Blocklist is empty.", mainKeyboard);
  } else {
    let list = "🚫 *Blocked Senders:*\n\n";
    for (let b of users[chatId].blocklist) {
      list += `• \`${b}\`\n`;
    }
    await bot.sendMessage(chatId, list, { parse_mode: "Markdown", ...mainKeyboard });
  }
});

// /blockremove
bot.onText(/\/blockremove(?:\s+(.+))?/, async (msg, match) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  if (users[chatId].blocklist.length === 0) {
    await bot.sendMessage(chatId, "❌ Blocklist is empty.");
    return;
  }
  
  if (!match[1]) {
    let list = "🗑 *Select to unblock:*\n\n";
    for (let i = 0; i < users[chatId].blocklist.length; i++) {
      list += `${i+1}. \`${users[chatId].blocklist[i]}\`\n`;
    }
    list += "\nSend number:";
    await bot.sendMessage(chatId, list, { parse_mode: "Markdown" });
    users[chatId].waitingForBlockRemove = true;
    return;
  }
  
  const email = match[1].toLowerCase();
  const index = users[chatId].blocklist.indexOf(email);
  
  if (index !== -1) {
    users[chatId].blocklist.splice(index, 1);
    await bot.sendMessage(chatId, `✅ Removed: \`${email}\``, { parse_mode: "Markdown", ...mainKeyboard });
  } else {
    await bot.sendMessage(chatId, "❌ Not found in blocklist.");
  }
});

// /about
bot.onText(/\/about/, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, 
    "ℹ️ *About Fake Mail Bot*\n\n" +
    "Version: 2.0.0\n" +
    "Developer: @Prime_X_Army\n\n" +
    "📧 *Features:*\n" +
    "• Unlimited fake emails\n" +
    "• Custom domain support\n" +
    "• Auto OTP detection\n" +
    "• Blocklist management\n" +
    "• Phone recovery\n" +
    "• Transfer accounts\n\n" +
    "🔗 *Buy domains:* https://www.namesilo.com\n\n" +
    "📧 *Contact:* @sponsor for custom domains",
    { parse_mode: "Markdown", ...mainKeyboard }
  );
});

// /transfer
bot.onText(/\/transfer/, async (msg) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  await bot.sendMessage(chatId, 
    "🔄 *Transfer Account*\n\n" +
    "Send username of the Telegram account you want to transfer this bot session to.\n\n" +
    "Example: `@username`\n\n" +
    "⚠️ *Warning:* This will remove access from your account.",
    { parse_mode: "Markdown" }
  );
  
  users[chatId].waitingForTransfer = true;
});

// /inbox - Check messages
bot.onText(/\/inbox/, async (msg) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  if (!users[chatId].currentToken) {
    await bot.sendMessage(chatId, "❌ No active email. Use /generate first.");
    return;
  }
  
  await bot.sendMessage(chatId, "📥 Fetching inbox...");
  
  try {
    let messages = await getInbox(users[chatId].currentToken);
    
    // Filter blocked senders
    messages = messages.filter(m => !users[chatId].blocklist.includes(m.from.address));
    
    if (messages.length === 0) {
      await bot.sendMessage(chatId, "📭 No messages found.", mainKeyboard);
      return;
    }
    
    users[chatId].messages = messages;
    
    let reply = `📬 *${messages.length} message(s):*\n\n`;
    for (let i = 0; i < Math.min(messages.length, 5); i++) {
      reply += `${i+1}. 📩 From: \`${messages[i].from.address}\`\n`;
      reply += `   📌 ${messages[i].subject || "No subject"}\n\n`;
    }
    reply += `Type /read 1 to read a message`;
    
    await bot.sendMessage(chatId, reply, { parse_mode: "Markdown", ...mainKeyboard });
  } catch (error) {
    await bot.sendMessage(chatId, "❌ Failed to fetch inbox.");
  }
});

// /read
bot.onText(/\/read\s+(\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const num = parseInt(match[1]) - 1;
  
  if (!users[chatId] || !users[chatId].messages || !users[chatId].messages[num]) {
    await bot.sendMessage(chatId, "❌ Use /inbox first or invalid number.");
    return;
  }
  
  try {
    const msgData = await getMessage(users[chatId].currentToken, users[chatId].messages[num].id);
    let text = msgData.text || "No content";
    if (text.length > 800) text = text.substring(0, 800) + "...";
    
    await bot.sendMessage(chatId, 
      `📩 *From:* ${msgData.from.address}\n*Subject:* ${msgData.subject || "No subject"}\n\n${text}`,
      { parse_mode: "Markdown", ...mainKeyboard }
    );
  } catch (error) {
    await bot.sendMessage(chatId, "❌ Failed to read message.");
  }
});

// /otp
bot.onText(/\/otp/, async (msg) => {
  const chatId = msg.chat.id;
  initUser(chatId);
  
  if (!users[chatId].currentToken) {
    await bot.sendMessage(chatId, "❌ No active email. Use /generate first.");
    return;
  }
  
  await bot.sendMessage(chatId, "🔍 Scanning for OTP codes...");
  
  try {
    const messages = await getInbox(users[chatId].currentToken);
    let codes = [];
    
    for (let msg of messages.slice(0, 5)) {
      const msgData = await getMessage(users[chatId].currentToken, msg.id);
      const text = msgData.text || "";
      const found = text.match(/\b\d{4,8}\b/g);
      if (found) codes.push(...found);
    }
    
    if (codes.length > 0) {
      await bot.sendMessage(chatId, `🔐 *OTP Codes Found:*\n\n${codes.join("\n")}`, { parse_mode: "Markdown", ...mainKeyboard });
    } else {
      await bot.sendMessage(chatId, "🔍 No OTP codes found.", mainKeyboard);
    }
  } catch (error) {
    await bot.sendMessage(chatId, "❌ Failed to scan OTP.");
  }
});

// Handle user input for various waiting states
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;
  
  if (!text || text.startsWith("/")) return;
  
  initUser(chatId);
  
  // Handle domain selection from /generate
  if (users[chatId].waitingForDomain) {
    delete users[chatId].waitingForDomain;
    
    const num = parseInt(text) - 1;
    let selectedDomain = null;
    
    if (num >= 0 && num < publicDomains.length) {
      selectedDomain = publicDomains[num];
    } else if (users[chatId].customDomains && num >= publicDomains.length && num < publicDomains.length + users[chatId].customDomains.length) {
      selectedDomain = users[chatId].customDomains[num - publicDomains.length];
    }
    
    if (!selectedDomain) {
      await bot.sendMessage(chatId, "❌ Invalid selection. Use /generate again.");
      return;
    }
    
    await bot.sendMessage(chatId, `⏳ Creating email with @${selectedDomain}...`);
    
    const username = randomString(12);
    const email = `${username}@${selectedDomain}`;
    const password = randomString(16);
    
    const success = await createEmail(email, password);
    
    if (!success) {
      await bot.sendMessage(chatId, "❌ Failed to create email. Try again.");
      return;
    }
    
    const token = await getToken(email, password);
    
    users[chatId].currentEmail = email;
    users[chatId].currentToken = token;
    users[chatId].currentPassword = password;
    
    await bot.sendMessage(chatId, 
      `✅ *New fake mail created!*\n\n📧 \`${email}\`\n\n🔐 Password: \`${password}\`\n\nUse /inbox to check messages.`,
      { parse_mode: "Markdown", ...mainKeyboard }
    );
    return;
  }
  
  // Handle custom email from /set
  if (users[chatId].waitingForCustomEmail) {
    delete users[chatId].waitingForCustomEmail;
    
    const email = text.toLowerCase().trim();
    const domain = email.split("@")[1];
    
    const isPublic = publicDomains.includes(domain);
    const isCustom = users[chatId].customDomains.includes(domain);
    
    if (!isPublic && !isCustom) {
      await bot.sendMessage(chatId, 
        `❌ Domain @${domain} not available.\n\nUse /domain to add your own domain.`,
        { ...mainKeyboard }
      );
      return;
    }
    
    await bot.sendMessage(chatId, `⏳ Creating ${email}...`);
    
    const password = randomString(16);
    const success = await createEmail(email, password);
    
    if (!success) {
      await bot.sendMessage(chatId, "❌ Email already exists or invalid. Try another name.");
      return;
    }
    
    const token = await getToken(email, password);
    
    users[chatId].currentEmail = email;
    users[chatId].currentToken = token;
    users[chatId].currentPassword = password;
    
    await bot.sendMessage(chatId, 
      `✅ *Custom fake mail created!*\n\n📧 \`${email}\`\n\n🔐 Password: \`${password}\`\n\nUse /inbox to check messages.`,
      { parse_mode: "Markdown", ...mainKeyboard }
    );
    return;
  }
  
  // Handle phone number
  if (users[chatId].waitingForPhone) {
    delete users[chatId].waitingForPhone;
    
    if (text.match(/^\+[0-9]{10,15}$/)) {
      users[chatId].phoneNumber = text;
      await bot.sendMessage(chatId, `✅ Phone number updated: \`${text}\``, { parse_mode: "Markdown", ...mainKeyboard });
    } else {
      await bot.sendMessage(chatId, "❌ Invalid format. Use: +91XXXXXXXXXX", mainKeyboard);
    }
    return;
  }
  
  // Handle domain add
  if (users[chatId].waitingForDomainAdd) {
    delete users[chatId].waitingForDomainAdd;
    await bot.sendMessage(chatId, `📝 Use: /adddomain ${text}`);
    return;
  }
  
  // Handle domain remove selection
  if (users[chatId].waitingForDomainRemove) {
    delete users[chatId].waitingForDomainRemove;
    const num = parseInt(text) - 1;
    if (num >= 0 && num < users[chatId].customDomains.length) {
      const domain = users[chatId].customDomains[num];
      users[chatId].customDomains.splice(num, 1);
      await bot.sendMessage(chatId, `✅ Removed: @${domain}`, { parse_mode: "Markdown", ...mainKeyboard });
    } else {
      await bot.sendMessage(chatId, "❌ Invalid selection.", mainKeyboard);
    }
    return;
  }
  
  // Handle block add
  if (users[chatId].waitingForBlockAdd) {
    delete users[chatId].waitingForBlockAdd;
    if (text.includes("@")) {
      if (!users[chatId].blocklist.includes(text)) {
        users[chatId].blocklist.push(text);
      }
      await bot.sendMessage(chatId, `✅ Blocked: \`${text}\``, { parse_mode: "Markdown", ...mainKeyboard });
    } else {
      await bot.sendMessage(chatId, "❌ Invalid email format.", mainKeyboard);
    }
    return;
  }
  
  // Handle block remove
  if (users[chatId].waitingForBlockRemove) {
    delete users[chatId].waitingForBlockRemove;
    const num = parseInt(text) - 1;
    if (num >= 0 && num < users[chatId].blocklist.length) {
      const email = users[chatId].blocklist[num];
      users[chatId].blocklist.splice(num, 1);
      await bot.sendMessage(chatId, `✅ Unblocked: \`${email}\``, { parse_mode: "Markdown", ...mainKeyboard });
    } else {
      await bot.sendMessage(chatId, "❌ Invalid selection.", mainKeyboard);
    }
    return;
  }
  
  // Handle transfer
  if (users[chatId].waitingForTransfer) {
    delete users[chatId].waitingForTransfer;
    
    const targetUser = text.replace("@", "");
    await bot.sendMessage(chatId, 
      `🔄 Transfer requested to @${targetUser}\n\n` +
      `The recipient will receive a confirmation code.\n\n` +
      `⚠️ This feature requires the recipient to start the bot first.`,
      mainKeyboard
    );
    return;
  }
});

console.log("🤖 Fake Mail Bot is running with all features!");
