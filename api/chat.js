// api/chat.js
module.exports = async function handler(req, res) {
    // 1. 设置跨域请求头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 2. 获取参数
    const question = req.query.question || (req.body && req.body.question);
    if (!question) {
        return res.status(400).json({ error: '提问内容不能为空' });
    }

    // 3. 获取环境变量
    const COZE_TOKEN = process.env.COZE_API_TOKEN;
    const COZE_BOT_ID = process.env.COZE_BOT_ID;

    if (!COZE_TOKEN || !COZE_BOT_ID) {
        return res.status(500).json({ error: "环境变量缺失：请检查 COZE_API_TOKEN 与 COZE_BOT_ID" });
    }

    try {
        // 4. 发起对话
        const response = await fetch("https://api.coze.cn/v3/chat", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${COZE_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                "bot_id": COZE_BOT_ID,
                "user_id": "user_" + Math.random().toString(36).substring(2, 9),
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

        // 如果扣子创建失败，把扣子返回的真实错误抛出来
        if (!data || data.code !== 0 || !data.data || !data.data.id) {
            return res.status(500).json({ 
                error: "扣子发起对话失败", 
                cozeError: data 
            });
        }

        const chatId = data.data.id;
        const conversationId = data.data.conversation_id;

        // 5. 轮询获取结果
        let isCompleted = false;
        let attempts = 0;

        while (!isCompleted && attempts < 15) {
            await new Promise(resolve => setTimeout(resolve, 1200));
            attempts++;

            const statusRes = await fetch(`https://api.coze.cn/v3/chat/retrieve?chat_id=${chatId}&conversation_id=${conversationId}`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${COZE_TOKEN}`,
                    "Content-Type": "application/json"
                }
            });

            const statusData = await statusRes.json();
            
            // 使用 ?. 避免 statusData.data 为 undefined 时崩溃
            const status = statusData && statusData.data ? statusData.data.status : null;

            if (status === "completed") {
                isCompleted = true;
            } else if (status === "failed" || status === "canceled") {
                return res.status(500).json({ error: "扣子生成回答失败", cozeError: statusData });
            } else if (!status) {
                return res.status(500).json({ error: "轮询异常，未获取到状态", cozeError: statusData });
            }
        }

        if (!isCompleted) {
            return res.status(500).json({ error: "等待扣子回答超时" });
        }

        // 6. 获取最终消息
        const msgRes = await fetch(`https://api.coze.cn/v3/chat/message/list?chat_id=${chatId}&conversation_id=${conversationId}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${COZE_TOKEN}`,
                "Content-Type": "application/json"
            }
        });

        const msgData = await msgRes.json();
        return res.status(200).json(msgData);

    } catch (error) {
        return res.status(500).json({ error: error.message || "服务器运行报错" });
    }
};
