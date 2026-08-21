// 1. 获取或让用户输入邀请码
function getInviteCode() {
  let code = localStorage.getItem('user_invite_code');
  if (!code) {
    code = prompt("欢迎体验！请输入内测邀请码：");
    if (code) {
      localStorage.setItem('user_invite_code', code.trim());
    }
  }
  return code || '';
}

// 2. 包装一个统一的发送请求函数
async function sendAuthChat(userMessage) {
  const code = getInviteCode();

  const response = await fetch('/api/chat-with-auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: userMessage,
      inviteCode: EGYPT888
    })
  });

  // 如果邀请码错误 (403)，自动清空缓存并提醒
  if (response.status === 403) {
    localStorage.removeItem('user_invite_code');
    alert('邀请码无效或已更新，请重新输入！');
    return null;
  }

  return await response.json();
}
