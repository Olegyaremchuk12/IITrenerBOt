const { Telegraf } = require('telegraf');
const OpenAI = require("openai");

// Подключаем переменные окружения.
// Если твой файл называется точно .env.example и ты не переименовал его в .env,
// то раскомментируй строку ниже, а следующую закомментируй:
// require('dotenv').config({ path: '.env.example' });
require('dotenv').config(); 

// 1. ПРОВЕРКА ПЕРЕМЕННЫХ (Теперь ищем TOKEN и API)
if (!process.env.TOKEN || !process.env.API) {
    console.error("ОШИБКА: Не найдены ключи! Убедитесь, что в файле .env (или .env.example) есть переменные TOKEN и API");
    process.exit(1);
}

// 2. Инициализация бота через TOKEN
const bot = new Telegraf(process.env.TOKEN);

// 3. Инициализация OpenAI через API
const openai = new OpenAI({
    baseURL: "https://api.deepseek.com", 
    apiKey: process.env.API 
});

// Промт Тренера
const SYSTEM_PROMPT = `
Ты — профессиональный фитнес-тренер. Твоя задача — вести клиента к цели (похудение, масса, рекомпозиция).
1. Запоминай параметры клиента (вес, рост, травмы), если он их назвал.
2. Отвечай кратко, емко и мотивирующе.
3. Используй спортивный сленг, но в меру.
4. Если данные не указаны, спроси их перед составлением программы.
`;

// ХРАНИЛИЩЕ СЕССИЙ (ПАМЯТЬ)
const sessions = {}; //cache "locale storage"

function initSession(userId) {
    sessions[userId] = [
        { role: "system", content: SYSTEM_PROMPT }
    ];
}

bot.command('start', async (ctx) => {
    const userId = ctx.from.id;
    initSession(userId);
    await ctx.reply("Привет! Я твой новый тренер. Напиши мне свою цель (похудение/масса) и текущие параметры (вес/рост/возраст). Погнали! 💪");
});

bot.command('reset', async (ctx) => {
    const userId = ctx.from.id;
    initSession(userId);
    await ctx.reply("Память очищена. Начинаем с чистого листа! Какая цель?");
});

bot.on("text", async (ctx) => {
    const userId = ctx.from.id; // берём айди юзера  
    const userMessage = ctx.message.text; //переводим это в обычный текст (сообщение юзера) 

    if (!sessions[userId]) {
        initSession(userId); // запуск сессии заново 
    }

    // Добавляем сообщение юзера
    sessions[userId].push({ role: "user", content: userMessage });

    try {
        await ctx.sendChatAction("typing");

        const completion = await openai.chat.completions.create({
            model: "deepseek-chat",
            messages: sessions[userId], 
            temperature: 0.7,
        });

        const botAnswer = completion.choices[0].message.content; // выбирает ключевые фрагменты 

        // Добавляем ответ бота
        sessions[userId].push({ role: "assistant", content: botAnswer });

        // Очистка старых сообщений, если их больше 20 (для экономии)
        if (sessions[userId].length > 20) {
            sessions[userId] = [
                sessions[userId][0], 
                ...sessions[userId].slice(-10)
            ];
        }

        await ctx.reply(botAnswer, { parse_mode: 'Markdown' }); //тип ответа скорость ответа 

    } catch (error) {
        console.error("Ошибка API:", error);
        await ctx.reply("Тренер занят (ошибка API). Попробуй позже.");
        sessions[userId].pop(); 
    }
});

bot.launch();
console.log("Бот запущен с использованием переменных API и TOKEN!");

process.once('SIGINT', () => bot.stop('SIGINT')); // 
process.once('SIGTERM', () => bot.stop('SIGTERM')); //