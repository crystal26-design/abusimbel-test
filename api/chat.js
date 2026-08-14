export default async function handler(req, res) {
  const token = process.env.COZE_API_TOKEN;
  const botId = process.env.COZE_BOT_ID;

  return res.status(200).json({
    token_exists: !!token,
    token_length: token ? token.length : 0,
    botid_exists: !!botId
  })
}
