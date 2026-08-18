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

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

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
            await sleep(700);
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

        await sleep(900);
        let msgData = null;
        let retryTimes = 0;
        const MAX_RETRY = 3;
        while (retryTimes < MAX_RETRY) {
            // ✅重点修复：POST请求，body传递chat_id，不要GET拼接url
            const msgResp = await fetch(`https://api.coze.cn/v3/chat/message/list`, {
                method: "POST",
                headers: HEADERS,
                body: JSON.stringify({
                    chat_id: chat_id
                })
            });
            msgData = await msgResp.json();
            if (msgData.code === 0 && Array.isArray(msgData.data)) {
                break;
            }
            retryTimes++;
            await sleep(800);
        }

        // 重试完毕判断，降级返回
        if (msgData.code !== 0 || !Array.isArray(msgData.data)) {
            return res.status(200).json({
                success: false,
                error: "扣子后端消息同步延迟，请重新提问",
                raw_msg_response: msgData
            });
        }

        const messages = msgData.data;
        const assistantMsg = messages.find(item => item.role === "assistant" && item.type === "answer");
        if (!assistantMsg) {
            return res.status(200).json({
                success: false,
                error: "未找到AI回答消息，请重新提问",
                raw: msgData
            });
        }
        const answerText = assistantMsg.content?.trim() || assistantMsg.reasoning_content;
        return res.status(200).json({
            success: true,
            answer: answerText
        });

    } catch (err) {
        return res.status(500).json({ error: "服务器异常", message: err.message });
    }
};
