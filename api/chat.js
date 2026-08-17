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
        // 使用 chat/completions 同步接口，一次POST直接拿到答案，不需要二次轮询
        const resp = await fetch("https://api.coze.cn/v3/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${COZE_TOKEN}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                bot_id: COZE_BOT_ID,
                user_id: "user_" + Math.random().toString(36).substring(2, 9),
                messages: [
                    {
                        role: "user",
                        content: question,
                        content_type: "text"
                    }
                ],
                stream: false
            })
        });

        const data = await resp.json();

        if(data.code !== 0){
            return res.status(500).json({
                error:"扣子调用失败",
                cozeError: data
            })
        }

        //提取assistant回答
        let answerText = "";
        if(data.data && Array.isArray(data.data.messages)){
            const assistantMsg = data.data.messages.find(m => m.role === "assistant");
            if(assistantMsg) answerText = assistantMsg.content;
        }

        if(!answerText){
            return res.status(500).json({error:"未获取模型回答",cozeError:data});
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
