module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const question = req.query.question || (req.body && req.body.question);
    if (!question) {
        return res.status(400).json({ error: '提问内容不能为空' });
    }

    const COZE_TOKEN = process.env.COZE_API_TOKEN;
    const COZE_BOT_ID = process.env.COZE_BOT_ID;

    if (!COZE_TOKEN || !COZE_BOT_ID) {
        return res.status(500).json({ error: "环境变量缺失：请检查 COZE_API_TOKEN 与 COZE_BOT_ID" });
    }

    try {
        // 1. 创建对话任务 正确接口 POST /v3/chat
        const createChat = await fetch("https://api.coze.cn/v3/chat", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${COZE_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                bot_id: COZE_BOT_ID,
                user_id: "user_" + Math.random().toString(36).substring(2, 9),
                stream: false,
                additional_messages: [
                    {
                        role: "user",
                        content: question,
                        content_type: "text"
                    }
                ]
            })
        });

        const chatCreateRes = await createChat.json();
        if (chatCreateRes.code !== 0) {
            return res.status(500).json({
                error: "创建对话失败",
                cozeError: chatCreateRes
            });
        }
        const chat_id = chatCreateRes.data.id;

        // 2. 轮询最多15次，等待对话完成
        let answerText = "";
        let chatResult;
        const maxPoll = 15;
        for (let i = 0; i < maxPoll; i++) {
            await new Promise(r => setTimeout(r, 700));
            const poll = await fetch(`https://api.coze.cn/v3/chat/retrieve?chat_id=${chat_id}`, {
                headers: { "Authorization": `Bearer ${COZE_TOKEN}` }
            });
            chatResult = await poll.json();
            if (chatResult.code !== 0) break;
            // 不是进行中就退出轮询
            if (chatResult.data.status !== "in_progress") break;
        }

        if (chatResult.code !== 0) {
            return res.status(500).json({
                error: "轮询获取对话结果失败",
                cozeError: chatResult
            });
        }

        // 读取消息列表
        const msgResp = await fetch(`https://api.coze.cn/v3/chat/message/list?chat_id=${chat_id}`, {
            headers: { "Authorization": `Bearer ${COZE_TOKEN}` }
        });
        const msgData = await msgResp.json();
        if (msgData.code !== 0) {
            return res.status(500).json({
                error: "获取消息列表失败",
                cozeError: msgData
            });
        }

        // 提取assistant回复
        const assistantMsg = msgData.data.messages.find(m => m.role === "assistant");
        if (assistantMsg) answerText = assistantMsg.content;

        if (!answerText) {
            return res.status(500).json({ error: "未获取模型回答", raw: msgData });
        }

        return res.status(200).json({
            success: true,
            answer: answerText
        });

    } catch (err) {
        return res.status(500).json({
            error: "服务器异常",
            message: err.message
        });
    }
};
