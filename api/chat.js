// pages/api/chat.js
module.exports = async function handler(req, res) {
    // 设置跨域请求头
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 获取参数
    const question = req.query.question || (req.body && req.body.question);
    if (!question) {
        return res.status(400).json({ error: '提问内容不能为空' });
    }

    // 获取环境变量
    const COZE_TOKEN = process.env.COZE_API_TOKEN;
    const COZE_BOT_ID = process.env.COZE_BOT_ID;

    if (!COZE_TOKEN || !COZE_BOT_ID) {
        return res.status(500).json({ error: "环境变量缺失：请检查 COZE_API_TOKEN 与 COZE_BOT_ID" });
    }

    try {
        // 1. 创建对话会话
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
                "auto_save_history": true
            })
        });

        const createData = await createChatResp.json();

        // 创建会话失败直接返回原始错误
        if (createData.code !== 0 || !createData.data || !createData.data.id) {
            return res.status(500).json({
                error: "扣子创建对话失败",
                cozeError: createData
            });
        }

        const chatId = createData.data.id;

        // 2. 轮询获取对话结果，最多等待30次
        let answerText = "";
        let finish = false;
        const maxPoll = 30;

        for (let i = 0; i < maxPoll; i++) {
            await new Promise(r => setTimeout(r, 800));

            const pollResp = await fetch(`https://api.coze.cn/v3/chat/${chatId}`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${COZE_TOKEN}`,
                    "Content-Type": "application/json"
                }
            });
            const pollData = await pollResp.json();

            if (pollData.code !== 0) {
                return res.status(500).json({
                    error: "轮询获取对话结果失败",
                    cozeError: pollData
                });
            }

            const status = pollData.data.status;
            const messages = pollData.data.messages || [];

            // 收集assistant回答文本
            for (const msg of messages) {
                if (msg.role === "assistant" && msg.type === "answer" && msg.content) {
                    answerText = msg.content;
                }
            }

            if (status === "completed") {
                finish = true;
                break;
            }
            if (status === "failed") {
                return res.status(500).json({
                    error: "扣子对话执行失败",
                    cozeError: pollData
                });
            }
        }

        if (!finish) {
            return res.status(504).json({ error: "对话超时，请重试" });
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
