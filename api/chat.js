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

    const COZE_TOKEN = process.env.COZE_API_TOKEN;
    const COZE_BOT_ID = process.env.COZE_BOT_ID;

    if (!COZE_TOKEN || !COZE_BOT_ID) {
        return res.status(500).json({ error: "环境变量缺失：请检查 COZE_API_TOKEN 与 COZE_BOT_ID" });
    }

    try {
        // 1. 创建流式chat会话
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
                "stream": true
            })
        });

        const createData = await createChatResp.json();
        if (createData.code !== 0 || !createData.data || !createData.data.id) {
            return res.status(500).json({
                error: "扣子创建对话失败",
                cozeError: createData
            });
        }
        const chatId = createData.data.id;

        // 2. 请求SSE stream接口拿到完整回复
        const streamResp = await fetch(`https://api.coze.cn/v3/chat/stream?chat_id=${chatId}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${COZE_TOKEN}`
            }
        });

        if (!streamResp.ok) {
            const errJson = await streamResp.json();
            return res.status(500).json({
                error: "获取流式流失败",
                cozeError: errJson
            });
        }

        // 读取SSE文本块，拼接answer
        const buffer = await streamResp.text();
        let answerText = "";
        const lines = buffer.split("\n");

        for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            const raw = line.replace(/^data:\s*/, "");
            if(raw === "[DONE]") continue;
            try {
                const event = JSON.parse(raw);
                if(event.type === "answer" && event.content){
                    answerText += event.content;
                }
            }catch(e){
                //忽略解析错误行
            }
        }

        if(!answerText){
            return res.status(500).json({error:"没有获取到模型回答"});
        }

        return res.status(200).json({
            success:true,
            answer: answerText
        });

    } catch (err) {
        return res.status(500).json({
            error: "服务器异常",
            message: err.message
        });
    }
};
