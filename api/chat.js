// pages/api/chat.js
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
        // 创建对话，关闭stream
        const createChatResp = await fetch("https://api.coze.cn/v3/chat", {
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
                "auto_save_history": true,
                "stream": false
            })
        });

        const createData = await createChatResp.json();
        if (createData.code !== 0 || !createData.data) {
            return res.status(500).json({
                error: "扣子创建对话失败",
                cozeError: createData
            });
        }
        const chatId = createData.data.id;
        const conversationId = createData.data.conversation_id;

        let answerText = "";
        let finished = false;
        const maxPoll = 40;

        for (let i = 0; i < maxPoll; i++) {
            await new Promise(r => setTimeout(r, 600));

            // 同时带上 conversation_id + chat_id 两个参数
            const msgResp = await fetch(`https://api.coze.cn/v3/chat/message/list?conversation_id=${conversationId}&chat_id=${chatId}`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${COZE_TOKEN}`
                }
            });

            const msgData = await msgResp.json();
            if (msgData.code !== 0) {
                return res.status(500).json({
                    error: "获取消息列表失败",
                    cozeError: msgData
                });
            }

            const messageList = msgData.data || [];
            for (const m of messageList) {
                if (m.role === "assistant" && m.type === "answer" && m.content) {
                    answerText = m.content;
                }
            }

            const chatInfo = messageList.find(item => item.type === "chat");
            if (chatInfo && chatInfo.status === "completed") {
                finished = true;
                break;
            }
            if (chatInfo && chatInfo.status === "failed") {
                return res.status(500).json({
                    error: "机器人对话执行失败",
                    cozeError: msgData
                });
            }
        }

        if (!finished) {
            return res.status(504).json({ error: "对话超时，请重新提问" });
        }
        if (!answerText) {
            return res.status(500).json({ error: "未获取到机器人回复" });
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
