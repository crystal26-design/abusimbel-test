import originalChatHandler from './chat.js';

export default async function handler(req, res) {
  // 1. 只处理 POST 请求
  if (req.method !== 'POST') {
    return res.status(405).json({ code: 405, msg: 'Method Not Allowed' });
  }

  // 2. 从前端提取用户输入的邀请码
  const { inviteCode } = req.body;

  // ----------------【 你允许的内测邀请码 】----------------
  // 想换码时，随时直接修改这里的字符串，重新提交代码即可！
  const ALLOWED_CODES = ['EGYPT2026', 'DENDERA888', 'VIP888'];
  // ----------------------------------------------------

  // 3. 校验邀请码
  const inputCode = (inviteCode || '').trim().toUpperCase();
  
  if (!ALLOWED_CODES.includes(inputCode)) {
    return res.status(403).json({
      code: 403,
      msg: 'INVALID_INVITE_CODE',
      detail: '邀请码错误，请输入正确的内测邀请码。'
    });
  }

  // 4. 校验通过，直接交给你原本跑通的 chat.js 处理 Coze API 调用
  return await originalChatHandler(req, res);
}
