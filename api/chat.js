module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const COZE_TOKEN = process.env.COZE_API_TOKEN;
    const COZE_BOT_ID = process.env.COZE_BOT_ID;
    if (!COZE_TOKEN || !COZE_BOT_ID) {
        return res.status(500).json({ error: "环境变量缺失" });
    }

    // ========== 新增接口：获取最终回答 ==========
    if (req.query.action === "getReply") {
        const { chat_id, conversation_id } = req.query;
        try {
            const msgResp = await fetch("https://api.coze.cn/v3/message/list", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${COZE_TOKEN}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    chat_id: chat_id,
                    conversation_id: conversation_id
                })
            });
            const json = await msgResp.json();
            if (json.code !== 0) {
                return res.status(400).json({ error: "拉取消息失败", raw: json });
            }
            // 找bot输出的type=answer消息
            const botMsg = json.data.find(item => item.type === "answer");
            if (!botMsg) {
                return res.status(400).json({ error: "未找到模型回答" });
            }
            return res.status(200).json({ answer: botMsg.content });
        } catch (err) {
            return res.status(500).json({ error: "服务器异常", msg: err.message });
        }
    }

    // ========== 原有chat会话创建逻辑 ==========
    const question = req.query.question || (req.body && req.body.question);
    if (!question) {
        return res.status(400).json({ error: '提问内容不能为空' });
    }

    try {
        const createChat = await fetch("https://api.coze.cn/v3/chat", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${COZE_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                bot_id: COZE_BOT_ID,
                user_id: "user_001",
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
        const chatJson = await createChat.json();
        if (chatJson.code !== 0) {
            return res.status(400).json({ error: "扣子调用失败", cozeError: chatJson });
        }
        // 返回 chat_id、conversation_id 交给前端
        return res.status(200).json({
            chat_id: chatJson.data.id,
            conversation_id: chatJson.data.conversation_id
        });
    } catch (e) {
        return res.status(500).json({ error: "服务器异常", msg: e.message });
    }
};
