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

    // ========== 获取最终回答 【修复接口地址+改为GET】 ==========
    if (req.query.action === "getReply") {
        const { chat_id, conversation_id } = req.query;
        try {
            // ✅正确接口，GET，参数放url query，不要body、不要POST
            const url = `https://api.coze.cn/v3/chat/message/list?chat_id=${encodeURIComponent(chat_id)}&conversation_id=${encodeURIComponent(conversation_id)}`;
            const msgResp = await fetch(url, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${COZE_TOKEN}`,
                    "Content-Type": "application/json"
                }
            });
            const json = await msgResp.json();

            if (json.code !== 0) {
                //任务还在思考，返回pending，不要返回400
                return res.status(200).json({ pending: true });
            }
            // 寻找bot的answer消息
            const botMsg = json.data.find(item => item.type === "answer");
            if (!botMsg) {
                //模型还没产出正式回答
                return res.status(200).json({ pending: true });
            }
            return res.status(200).json({ pending:false, answer: botMsg.content });

        } catch (err) {
            //网络异常，标记pending继续轮询
            return res.status(200).json({ pending: true });
        }
    }

    // ========== 创建chat会话逻辑 ==========
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
        return res.status(200).json({
            chat_id: chatJson.data.id,
            conversation_id: chatJson.data.conversation_id
        });
    } catch (e) {
        return res.status(500).json({ error: "服务器异常", msg: e.message });
    }
};
