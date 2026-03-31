/**
 * 脚本名称：HiFi.js
 * 脚本说明：这是一个用于 https://www.hifiti.com 网站的自动签到脚本。
 * 运行环境：青龙面板
 * * ================== 环境变量使用说明 ==================
 * 在青龙面板的【环境变量】中添加：
 * 名称 (Name)：ACCOUNTS
 * 值 (Value)：必须是严格的 JSON 数组格式（属性名必须用双引号包围）
 * * 示例 1 - 单账号：
 * [{"cookie": "你的完整cookie字符串"}]
 * * 示例 2 - 多账号：
 * [
 * {"cookie": "第一个账号的cookie"},
 * {"cookie": "第二个账号的cookie"}
 * ]
 * ======================================================
 */

const notify = require('./sendNotify');
const cheerio = require('cheerio');

const signUrl = 'https://www.hifiti.com/sg_sign.htm';
const profileUrl = 'https://www.hifiti.com/my.htm'; 
const responseSuccessCode = "0";

// 读取并解析环境变量中的账号数据
const accounts = process.env.ACCOUNTS ? JSON.parse(process.env.ACCOUNTS) : [];

function now() { return new Date().toLocaleString(); }

// 获取用户信息：用户名、总金币、连续签到天数
async function getUserInfo(account) {
  let consecutiveDays = '未知';
  let totalPoints = '未知';
  // 抓取失败时的默认专属文案
  let realName = '可恶! 奴家没有猜到! ☹️'; 

  try {
    // 1. 请求个人中心获取：用户名、总金币
    const resMy = await fetch(profileUrl, {
      headers: { Cookie: account.cookie, "User-Agent": "Mozilla/5.0" }
    });
    if (resMy.ok) {
      const htmlMy = await resMy.text();
      const $ = cheerio.load(htmlMy);
      
      // 提取总金币
      $('span.text-muted').each(function() {
        if ($(this).text().includes('金币：')) {
          totalPoints = $(this).next('em').text().trim();
        }
      });

      // 提取真实用户名 (尝试从网页 title 中抓取)
      const titleText = $('title').text();
      const titleMatch = titleText.match(/(.*?)(?:的个人|-)/); 
      if (titleMatch && titleMatch[1] && titleMatch[1].trim() !== '') {
        realName = titleMatch[1].trim();
      } else {
        // 尝试抓取页面内常见的用户名元素备用
        const possibleName = $('h3, h4, .profile-name, .username').first().text().trim();
        if (possibleName && possibleName.length > 0 && possibleName.length < 20) {
          realName = possibleName;
        }
      }
    }

    // 2. 请求签到页获取：连续签到天数
    const resSign = await fetch(signUrl, {
      method: 'GET',
      headers: { Cookie: account.cookie, "User-Agent": "Mozilla/5.0" }
    });
    if (resSign.ok) {
      const htmlSign = await resSign.text();
      // 使用正则提取源码底部的变量获取天数
      const matchDays = htmlSign.match(/连续签到(\d+)天/);
      if (matchDays && matchDays[1]) {
        consecutiveDays = matchDays[1];
      }
    }
  } catch (err) {
    console.error("解析用户信息出错:", err);
  }

  return {
    realName: realName,
    consecutiveDays: consecutiveDays,
    totalPoints: totalPoints
  };
}

// 执行签到动作
async function checkIn(account) {
  const res = await fetch(signUrl, {
    method: 'POST',
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "User-Agent": "Mozilla/5.0",
      Cookie: account.cookie
    }
  });
  if (!res.ok) throw new Error(`接口请求失败 HTTP状态码:${res.status}`);
  const data = await res.json();
  
  if (data.code === responseSuccessCode) return data.message;
  if (data.message && data.message.includes("今天已经签过啦")) return "今天已经签过啦！";
  
  throw new Error(data.message || "未知错误");
}

// 核心主流程
async function main() {
  if (!accounts.length) {
    console.error('❌ 未配置任何账户，请设置 ACCOUNTS 环境变量');
    return;
  }

  const accountLines = [];

  for (const acc of accounts) {
    let info;
    try {
      // 执行签到并拉取最新用户信息
      const msg = await checkIn(acc);
      info = await getUserInfo(acc);

      // 处理签到结果文案
      let resultText = '';
      if (msg === "今天已经签过啦！") {
        resultText = '今天已经签过啦!🤦🏻‍♀️';
      } else {
        // 尝试提取本次获得的金币数量
        let gainedPoints = '未知';
        const matchPoints = msg.match(/总奖励(\d+)/); 
        if (matchPoints) gainedPoints = matchPoints[1];
        
        resultText = `签到成功! 🎉 (本次获得${gainedPoints}金币)`;
      }

      // 格式化输出面板
      const line = `🥷🏻用户：${info.realName}\n🙊签到结果：${resultText}\n📆连续签到：${info.consecutiveDays}${info.consecutiveDays !== '未知' ? '天' : ''}\n💰当前总金币：${info.totalPoints}`;

      console.log(line);
      accountLines.push(line);

    } catch (err) {
      // 签到异常处理逻辑
      info = await getUserInfo(acc);
      
      const line = `🥷🏻用户：${info.realName}\n🙊签到结果：签到失败!☹️(${err.message})\n📆连续签到：${info.consecutiveDays}${info.consecutiveDays !== '未知' ? '天' : ''}\n💰当前总金币：${info.totalPoints}`;
      
      console.error(line);
      accountLines.push(line);
    }
  }

  // 拼接最终推送内容
  const title = '𝐇𝕚𝐅𝕚 · 签到小报告 🎧';
  const fullReport = accountLines.join('\n\n---\n\n'); 
  
  // 发送青龙面板推送通知
  await notify.sendNotify(title, fullReport);
}

// 捕获未处理的异常，防止脚本直接崩溃
process.on('unhandledRejection', err => console.error('未处理异常:', err));

main().catch(async err => {
  console.error('❗ 脚本执行出错:', err);
  await notify.sendNotify('𝐇𝕚𝐅𝕚 · 签到异常', `错误详情: ${err.message}`);
});