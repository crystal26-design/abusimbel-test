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
        return res.status(500).json({ error: "环境变量缺失" });
    }

    const HEADERS = {
        "Authorization": `Bearer ${COZE_TOKEN}`,
        "Content-Type": "application/json"
    };

    try {
        //1 创建对话任务
        const createResp = await fetch("https://api.coze.cn/v3/chat", {
            method: "POST",
            headers: HEADERS,
            body: JSON.stringify({
                bot_id: COZE_BOT_ID,
                user_id: "user_" + Date.now(),
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

        const chatCreateRes = await createResp.json();
        if (chatCreateRes.code !== 0) {
            return res.status(500).json({ error: "创建对话失败", cozeError: chatCreateRes });
        }

        const chat_id = chatCreateRes.data.id;
        const conversation_id = chatCreateRes.data.conversation_id;

        //2 轮询等待完成
        let chatResult;
        const maxPoll = 15;
        for (let i = 0; i < maxPoll; i++) {
            await new Promise(r => setTimeout(r, 700));
            const pollResp = await fetch(`https://api.coze.cn/v3/chat/retrieve?conversation_id=${conversation_id}&chat_id=${chat_id}`, {
                headers: HEADERS
            });
            chatResult = await pollResp.json();
            if (chatResult.code !== 0) break;
            if (chatResult.data.status !== "in_progress") break;
        }

        if (chatResult.code !== 0) {
            return res.status(500).json({ error: "轮询查询对话失败", cozeError: chatResult });
        }

        //3 请求消息列表
        const msgResp = await fetch(`https://api.coze.cn/v3/chat/message/list?conversation_id=${conversation_id}&chat_id=${chat_id}`, {
            headers: HEADERS
        });
        const msgData = await msgResp.json();

        if (msgData.code !== 0) {
            return res.status(500).json({ error: "获取消息列表失败", cozeError: msgData });
        }
        // 关键修复：msgData.data 本身就是消息数组，不是 {messages:[]} 对象
        if (!Array.isArray(msgData.data)) {
            return res.status(500).json({
                error: "message/list 返回数据异常",
                raw_msg_response: msgData
            });
        }
        const messages = msgData.data;

        const assistantMsg = messages.find(item => item.role === "assistant" && item.type === "answer");
        if (!assistantMsg) {
            return res.status(500).json({ error: "未找到AI回答消息", raw: msgData });
        }

        //兼容 content为空取reasoning_content
        const answerText = assistantMsg.content?.trim() || assistantMsg.reasoning_content;

        return res.status(200).json({
            success: true,
            answer: answerText
        });

    } catch (err) {
        return res.status(500).json({ error: "服务器异常", message: err.message });
    }
};
