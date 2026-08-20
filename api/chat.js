module.exports = async function handler(req, res) {
    // 跨域头放最前面，OPTIONS可以正常使用
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // 优先处理跨域预检，直接返回，不执行SSE逻辑
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // 只有POST聊天请求才设置SSE流式头
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');

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

    const cozeBody = {
        bot_id: COZE_BOT_ID,
        user_id: "user_" + Date.now(),
        stream: true,
        thinking_type: "disabled", // 强制关闭深度思考
        additional_messages: [
            {
                role: "user",
                content: question,
                content_type: "text"
            }
        ]
    };

    try {
        const cozeResp = await fetch("https://api.coze.cn/v3/chat", {
            method: "POST",
            headers: HEADERS,
            body: JSON.stringify(cozeBody)
        });

        const reader = cozeResp.body.getReader();
        const decoder = new TextDecoder("utf-8");
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value, { stream: true });
            res.write(chunk);
        }
        res.end();
    } catch (err) {
        return res.status(500).json({ error: "服务器异常", message: err.message });
    }
};
