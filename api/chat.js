// api/chat.js
export default async function handler(req, res) {
    // 1. 设置跨域安全请求头（允许前端网页顺利调取）
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 2. 获取前端网页传过来的问题
    const { question } = req.query;
    if (!question) {
        return res.status(400).json({ error: "Missing question parameter" });
    }

    // 3. 从 Vercel 环境变量中安全读取 Token 和 Bot ID（隐藏钥匙）
    const COZE_TOKEN = process.env.COZE_API_TOKEN;
    const COZE_BOT_ID = process.env.COZE_BOT_ID;

    if (!COZE_TOKEN || !COZE_BOT_ID) {
        return res.status(500).json({ error: "Server API token or Bot ID not configured" });
    }

    try {
        // 4. 第一步：向扣子发起 API 对话请求
        const response = await fetch("https://api.coze.cn/v3/chat", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${COZE_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "bot_id": COZE_BOT_ID,
                "user_id": "tourist_" + Math.random().toString(36).substring(2, 9),
                "additional_messages": [
                    {
                        "role": "user",
                        "content": question,
                        "content_type": "text"
                    }
                ],
                "auto_save_history": true
            })
        });

        const data = await response.json();
        if (data.code !== 0) {
            return res.status(500).json({ error: data.msg || "Coze API Error" });
        }

        const chatId = data.data.id;

        // 5. 第二步：轮询状态，等待扣子回答完毕（设置上限防止死循环）
        let isCompleted = false;
        let attempts = 0;
        let finalAnswer = "法老沉思了太久，请重试一下吧。";

        while (!isCompleted && attempts < 10) {
            // 每隔 1.2 秒查询一次回答进度
            await new Promise(resolve => setTimeout(resolve, 1200));
            attempts++;

            const statusRes = await fetch(`https://api.coze.cn/v3/chat/retrieve?chat_id=${chatId}`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${COZE_TOKEN}`,
                    "Content-Type": "application/json"
                }
            });

            const statusData = await statusRes.json();
            const status = statusData.data.status;

            if (status === "completed") {
                isCompleted = true;
                // 对话完成，拉取消息列表中的法老回答
                const msgRes = await fetch(`https://api.coze.cn/v3/chat/message/list?chat_id=${chatId}`, {
                    method: "GET",
                    headers: {
                        "Authorization": `Bearer ${COZE_TOKEN}`,
                        "Content-Type": "application/json"
                    }
                });
                const msgData = await msgRes.json();
                const assistantMessage = msgData.data.find(msg => msg.role === "assistant" && msg.type === "answer");
                if (assistantMessage) {
                    finalAnswer = assistantMessage.content;
                }
            } else if (status === "failed" || status === "canceled") {
                isCompleted = true;
                finalAnswer = "法老暂时不想回答这个问题，请重新提问。";
            }
        }

        // 6. 将法老的回答安全返回给前端网页
        return res.status(200).json({ answer: finalAnswer });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
