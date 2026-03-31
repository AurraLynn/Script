/*
 * 脚本名称：Kuwo.js
 * 脚本功能：酷我音乐(积分)日常任务 - 终极美化合并版
 * 运行环境：青龙面板 (Node.js)
 * * ================= 配置方法 =================
 * 在青龙面板的 【环境变量】 页面中添加：
 * 变量名： KUWO_COOKIES
 * 变量值： userid@websid 
 * (例如：12345678@ad8df9a8df7df9a8)
 *
 * ================= 如何获取 =================
 * 以 Safari 浏览器为例：
 * 1. 打开酷我音乐网页版 (www.kuwo.cn) 并登录账号。
 * 2. 点击顶部菜单栏的“开发”，选择“显示网页检查器”。
 * 3. 在弹出的检查器窗口中，点击“存储空间”标签页。
 * 4. 展开左侧的“Cookie”列表，找到并选中酷我相关的域名。
 * 5. 在右侧数据中，分别提取 `userid` 和 `websid` 的值。
 * 6. 将这两个值用 @ 符号拼起来填入变量即可。
 * ============================================
 */

const $ = new Env('酷我音乐');

// 🔔🔔🔔 通知设置区 🔔🔔🔔
const notifyMode = 1; // 1 = 测试模式(每次运行必发) ， 2 = 间隔模式(防打扰挂机使用)
const notifyInterval = 120; // 间隔模式下，多少分钟发一次通知

let notify = null;
try { notify = require('./sendNotify'); } catch (e) { notify = null; }

let notifyMsg = []; 
let allNotifyMsgs = []; 
const Clear = Number($.getval("Clear") || process.env.CLEAR || 0);

// 获取环境变量并防空处理
let accounts = $.getdata('Kuwo_cookies') || $.getdata('KUWO_COOKIES') || ($.isNode() ? process.env.KUWO_COOKIE : '') || ($.isNode() ? process.env.KUWO_COOKIES : '');
let accountArr = accounts ? accounts.split(/[&]/).map(a => a.trim()) : []; 

if (accountArr.length === 0 || !accounts.includes('@')) {
    $.log('⚠️ 未检测到有效Cookie，请检查环境变量设置！');
    $.done();
}

const kw_headers = {
    'Origin' : `https://h5app.kuwo.cn`,
    'Accept-Encoding' : `gzip, deflate, br`,
    'Connection' : `keep-alive`,
    'Sec-Fetch-Mode' : `cors`,
    'Accept' : `application/json, text/plain, */*`,
    'Host' : `integralapi.kuwo.cn`,
    'User-Agent' : `Mozilla/5.0 (iPhone; CPU iPhone OS 18_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KWMusic/11.2.3.0 DeviceModel/iPhone15,3 NetType/WIFI kuwopage`,
    'Sec-Fetch-Site' : `same-site`,
    'Referer' : `https://h5app.kuwo.cn/`,
    'Accept-Language' : `zh-CN,zh-Hans;q=0.9`
};

!(async () => {
    $.log(`检测到 ${accountArr.length} 个有效账户`);

    for (let i = 0; i < accountArr.length; i++) {
        const ID = accountArr[i];
        if (!ID.includes('@')) continue;

        if (Clear == 1) {
            await clearEnvVars();
            $.log('所有Cookie已清除！！！');
            $.done(); return;
        }

        const nickname = await getNickname(ID);
        const displayName = nickname || `自动获取的用户${i + 1}`;
        notifyMsg = []; 

        if (!nickname) {
            allNotifyMsgs.push(`🥷🏻 用户：${displayName}\n⚠️ Cookie 已失效，请及时更新`);
            continue;
        }

        // 获取资产和会员
        let assetStr = await getAsset(ID);
        let vipStr = await VipExtime(ID);

        // 执行核心任务（带原版安全锁）
        await executeTasks(ID, displayName);

        // 生成账号卡片
        const accountCard = buildReportCard(displayName, assetStr, vipStr, notifyMsg);
        allNotifyMsgs.push(accountCard);
    }

    // 多账号合并通知发送逻辑
    if (allNotifyMsgs.length > 0) {
        let shouldNotify = false;
        
        if (notifyMode === 1) {
            shouldNotify = true; 
        } else if (notifyMode === 2) {
            let lastNotifyTime = Number($.getval('kuwoLastNotifyTime') || 0);
            let nowTime = Date.now();
            if (nowTime - lastNotifyTime >= notifyInterval * 60 * 1000) {
                shouldNotify = true;
                $.setval(String(nowTime), 'kuwoLastNotifyTime');
            }
        }

        if (shouldNotify) {
            const title = "𝐊𝕦𝕨𝕠 · 任务详情小报告 🎧";
            const mergedMessage = allNotifyMsgs.join('\n\n┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈\n\n');
            if (notify) {
                await notify.sendNotify(title, mergedMessage);
                $.log(`\n🔔 已合并推送通知！`);
            } else {
                $.log(`\n🔇 未找到 sendNotify，合并排版预览如下：\n\n${title}\n\n${mergedMessage}`);
            }
        } else {
            $.log(`\n🔇 未到设定的通知间隔时间 (${notifyInterval}分钟)，本次后台静默运行结束。`);
        }
    }
})().catch((e) => $.logErr(e)).finally(() => $.done());

// --- 🛡️ 任务调度 (恢复原版安全防封策略) ---
async function executeTasks(ID, displayName) {
    $.log(`\n=== 开始执行任务 - 账户：${displayName} ===`);

    const now = new Date();
    const currentDate = new Date();
    const currentHour = now.getHours();
    const currentMinute = now.getMinutes();

    // 【安全锁1】只在 7:00 - 20:00 的整点运行整点打卡和定时宝箱
    if (currentHour >= 7 && currentHour <= 20 && currentMinute === 0) {
        $.log(`🟢 当前时间 ${currentHour}:00，符合条件，执行整点打卡与宝箱`);
        await Clockin(ID);
        await box(ID);  
    }
    
    // 每十分钟开一次活动宝箱 (无伤大雅，保持)
    await BoxTask(ID);

    // 【安全锁2】大任务严格限制时间段
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    const morningStart = 6 * 60 + 30, morningEnd = 7 * 60 + 30;
    const eveningStart = 19 * 60 + 30, eveningEnd = 20 * 60 + 30;

    let executedTasks = JSON.parse($.getval('executedTasks') || '{}');
    const today = currentDate.toISOString().slice(0, 10); 
    if (!executedTasks[today]) executedTasks[today] = { morning: [], evening: [] };

    let timeSlot = null;
    if (currentTotalMinutes >= morningStart && currentTotalMinutes <= morningEnd) {
        timeSlot = 'morning';
    } else if (currentTotalMinutes >= eveningStart && currentTotalMinutes <= eveningEnd) {
        timeSlot = 'evening';
    }

    if (timeSlot) {
        $.log(`🟢 当前时间属于 ${timeSlot} 时段`);
        // 如果当前账号当天该时段没执行过，才执行
        if (!executedTasks[today][timeSlot].includes(ID)) {
            await novel(ID);
            await mobile(ID);
            await Listen(ID);
            await Earning(ID);
            await collect(ID);
            await loterry_free(ID);
            await new_sign(ID);
            await sign(ID);

            for (let i = 0; i < 20; i++) { await video(ID); await $.wait(500); }
            for (let k = 0; k < 8; k++) { await loterry_video(ID); await $.wait(500); }

            executedTasks[today][timeSlot].push(ID);
            $.setval(JSON.stringify(executedTasks), 'executedTasks');
        } else {
            $.log(`⏭️ 本时段大任务已完成过，防封跳过`);
        }
    }

    // 【安全锁3】惊喜任务独立逻辑
    await $.wait(1000); 
    await surprise(ID);
}

// --- 🎨 智能折叠排版 & 梗生成器 ---
function buildReportCard(displayName, assetStr, vipStr, logs) {
    let res = `🥷🏻 用户：${displayName}\n${assetStr}\n${vipStr}\n`;
    let daily = [], box = [], lottery = [];
    
    let counts = {};
    logs.forEach(log => { counts[log] = (counts[log] || 0) + 1; });

    for (let [log, count] of Object.entries(counts)) {
        // 🚨 强力过滤无用通知
        const ignoreWords = ['已完成', '上限', '已领', '已打卡', '校验失败', '稍候', '频繁', '用完', '暂无', '已达到', '当日', '明天'];
        if (ignoreWords.some(w => log.includes(w))) continue;

        let line = log;
        if (count > 1) line += ` [x${count}]`;

        if (line.includes('✅') || line.includes('🎁') || line.includes('🎉')) {
            if (line.includes('签到状态')) line += ' [今天也是元气满满的一天鸭~]';
            else if (line.includes('签到额外')) line += ' [白嫖的快乐]';
            else if (line.includes('打卡')) line += ' [这波整点卡得很准 🫸]';
            else if (line.includes('听歌:')) line += ' [给耳朵做个SPA 💆🏻‍♂️]';
            else if (line.includes('小说')) line += ' [书中自有黄金屋 📖]';
            else if (line.includes('视频')) line += ' [看了这么多，导演该加鸡腿了 🍗]';
            else if (line.includes('累计奖励')) line += ' [羊毛薅得光秃秃 🐑]';
            else if (line.includes('补领宝箱')) line += ' [亡羊补牢，羊毛不嫌晚 🐑]';
            else if (line.includes('定时宝箱')) line += ' [开个盲盒试试手气]';
            else if (line.includes('免费抽奖')) line += ' [单车变摩托 🛵]';
            else if (line.includes('视频抽奖')) line += ' [非酋落泪，欧皇附体]';
            else if (line.includes('惊喜')) line += ' [转角遇到小确幸 💕]';
        } else if (line.includes('❌') || line.includes('⚠️') || line.includes('🔴')) {
            if (line.includes('签到')) line += ' [服务器被外星人劫持了 🛸]';
            else if (line.includes('听歌时长')) line += ' [网线被狗咬断了吧 🐶]';
            else if (line.includes('视频')) line += ' [群演跑路了，没看成 🎬]';
            else line += ' [可能被反作弊盯上了，稳住 🤷🏻‍♂️]';
        }

        if (line.includes('宝箱')) box.push(line);
        else if (line.includes('抽奖') || line.includes('惊喜')) lottery.push(line);
        else daily.push(line);
    }

    if (daily.length === 0 && box.length === 0 && lottery.length === 0) {
        res += '\n🎉 【状态】安全防封锁生效，当前时段无任务或已完成，静默挂机中... ☕';
        return res;
    }

    if (daily.length) res += '\n📝 【日常打卡类】\n' + daily.join('\n');
    if (box.length) res += '\n\n🎁 【宝箱奖励类】\n' + box.join('\n');
    if (lottery.length) res += '\n\n🎰 【抽奖 & 惊喜类】\n' + lottery.join('\n');
    
    return res;
}

// ---------------- 独立接口功能 ----------------

async function clearEnvVars() { $.setdata('', 'Kuwo_cookies'); }

async function getNickname(ID) {
    let [loginUid] = ID.split('@');
    return new Promise((resolve) => {
        let url = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/v1/music/userBase?loginUid=${loginUid}`, headers: kw_headers };
        $.get(url, (err, resp, data) => {
            try { resolve(err ? '' : JSON.parse(data).data.nickname); } catch (e) { resolve(''); }
        });
    });
}

async function VipExtime(ID) {
    const [loginUid, loginSid] = ID.split('@');
    let options = {
        url: `http://vip1.kuwo.cn/vip/v2/user/vip?op=ui&uid=${loginUid}&sid=${loginSid}&signver=new`,
        headers: { "Host": "vip1.kuwo.cn", "User-Agent": "%E9%85%B7%E6%88%91%E9%9F%B3%E4%B9%90/3830 CFNetwork/1498.700.2.1.1 Darwin/23.6.0" }
    };
    return $.http.get(options).then((resp) => {
        try {
            const obj = JSON.parse(resp.body || resp);
            let expireTimestamp = Number(obj.data?.vipLuxuryExpire || obj.data?.vipmExpire || obj.data?.vipExpire || 0);
            if (!expireTimestamp) return '👑 会员：原来尊贵的体验还没解锁，难怪画面都在留遗憾～ 🤦🏻‍♀️';
            if (expireTimestamp < 1e12) expireTimestamp *= 1000;
            const ed = new Date(expireTimestamp);
            return `👑 会员：解锁全站特权的人 👻 ${ed.getFullYear()}-${String(ed.getMonth() + 1).padStart(2, '0')}-${String(ed.getDate()).padStart(2, '0')} 到期`;
        } catch (e) { return '👑 会员：获取状态异常'; }
    });
}

async function getAsset(ID) {
    const [loginUid, loginSid] = ID.split('@');
    let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/v1/earningSignIn/earningUserSignList?loginUid=${loginUid}&loginSid=${loginSid}`, headers: kw_headers };
    return $.http.get(options).then((resp) => {
        let desc = `❌ 资产查询失败`;
        try {
            var obj = JSON.parse(resp.body);
            if (obj.code == 200 && obj.success) {
                var score = obj.data.remainScore || 0;
                desc = score ? `💰 资产：${score} 积分 [≈ ${(score / 10000).toFixed(2)} CNY]` : `💰 资产：0 积分 [≈ 0.00 CNY]`;
                if (score > 0 && score < 1000) desc += " [这点钱够买包辣条吗 🤔]";
            }
        } catch (e) {}
        return desc;
    });
}

async function novel(ID) {
    const [loginUid, loginSid] = ID.split('@');
    let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/v1/earningSignIn/everydaymusic/doListen?loginUid=${loginUid}&loginSid=${loginSid}&from=novel&goldNum=18`, headers: kw_headers };
    return $.http.get(options).then((resp) => {
        let obj = JSON.parse(resp.body);
        let msg = obj.data?.description || obj.msg || "未知状态";
        notifyMsg.push(obj.success ? `✅ 每日小说: ${msg}` : `❌ 每日小说: ${msg}`);
    });
}

async function mobile(ID) {
    const [loginUid, loginSid] = ID.split('@');
    let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/v1/earningSignIn/everydaymusic/doListen?loginUid=${loginUid}&loginSid=${loginSid}&from=mobile&goldNum=18`, headers: kw_headers };
    return $.http.get(options).then((resp) => {
        let obj = JSON.parse(resp.body);
        let msg = obj.data?.description || obj.msg || "未知状态";
        notifyMsg.push(obj.success ? `✅ 每日听歌: ${msg}` : `❌ 每日听歌: ${msg}`);
    });
}

async function cxListen(ID) {
    const [loginUid, loginSid] = ID.split('@');
    let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/v1/earningSignIn/newUserSignList?loginUid=${loginUid}&loginSid=${loginSid}`, headers: kw_headers };
    return $.http.get(options).then((resp) => {
        let obj = JSON.parse(resp.body);
        if (obj.code === 200 && obj.success) {
            let listenTasks = obj.data.dataList.find(task => task.taskType === "listen");
            if (!listenTasks || !listenTasks.listenList) return { golds: [] };
            let golds = listenTasks.listenList.filter(task => task.timetraStatus != "0" && task.goldNum != "null").map(task => ({ goldNum: task.goldNum, time: task.time, unit: task.unit }));
            return { golds };
        }
        return { golds: [] };
    });
}

async function Listen(ID) {
    const [loginUid, loginSid] = ID.split('@');
    let { golds } = await cxListen(ID);
    if (golds.length === 0) { notifyMsg.push(`❌ 听歌时长: 今天已完成`); return; }
    for (let task of golds) {
        if (task.goldNum && task.time && task.unit) {
            let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/v1/earningSignIn/newDoListen?loginUid=${loginUid}&loginSid=${loginSid}&from=listen&goldNum=${task.goldNum}&listenTime=${task.time}&unit=${task.unit}`, headers: kw_headers };
            await $.http.get(options).then((resp) => {
                let obj = JSON.parse(resp.body);
                notifyMsg.push(obj.success ? `✅ 听歌时长: ${obj.data?.description || '成功'}` : `⚠️ 听歌时长: ${obj.msg}`);
            });
        }
    }
}

async function collect(ID) {
    const [loginUid, loginSid] = ID.split('@');
    let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/v1/earningSignIn/everydaymusic/doListen?loginUid=${loginUid}&loginSid=${loginSid}&from=collect&goldNum=18`, headers: kw_headers };
    return $.http.get(options).then((resp) => {
        let obj = JSON.parse(resp.body);
        let msg = obj.data?.description || obj.msg || "未知状态";
        notifyMsg.push(obj.success ? `✅ 每日收藏: ${msg}` : `❌ 每日收藏: ${msg}`);
    });
}

async function video(ID) {
    const [loginUid, loginSid] = ID.split('@');
    let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/v1/earningSignIn/everydaymusic/doListen?loginUid=${loginUid}&loginSid=${loginSid}&from=videoadver&goldNum=58`, headers: kw_headers };
    return $.http.get(options).then((resp) => {
        let obj = JSON.parse(resp.body);
        let msg = obj.data?.description || obj.msg || "未知状态";
        notifyMsg.push(obj.success ? `✅ 创意视频: ${msg}` : `❌ 创意视频: ${msg}`);
    });
}

async function sign(ID) {
    const [loginUid, loginSid] = ID.split('@');
    let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/v1/earningSignIn/everydaymusic/doListen?loginUid=${loginUid}&loginSid=${loginSid}&from=sign&extraGoldNum=110`, headers: kw_headers };
    return $.http.get(options).then((resp) => {
        let obj = JSON.parse(resp.body);
        let msg = obj.data?.description || obj.msg || "未知状态";
        notifyMsg.push(obj.success ? `✅ 签到额外奖励: ${msg}` : `❌ 签到额外奖励: ${msg}`);
    });
}

async function new_sign(ID) {
    const [loginUid, loginSid] = ID.split('@');
    let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/v1/earningSignIn/newUserSignList?loginUid=${loginUid}&loginSid=${loginSid}`, headers: kw_headers };
    return $.http.get(options).then((resp) => {
        let obj = JSON.parse(resp.body);
        let msg = obj.data?.isSign ? "今天已完成" : (obj.msg || "失败");
        notifyMsg.push(obj.success ? `✅ 签到状态: ${msg}` : `❌ 签到状态: ${msg}`);
    });
}

async function Earning(ID) {
    const [loginUid, loginSid] = ID.split('@');
    const taskIds = [1, 2, 3];
    for (const taskId of taskIds) {
        let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/v1/earningSignIn/newDoListen?loginUid=${loginUid}&loginSid=${loginSid}&from=coinAccumulationTask&taskId=${taskId}`, headers: kw_headers };
        try {
            let resp = await $.http.get(options);
            let obj = JSON.parse(resp.body);
            let msg = obj.data?.description || obj.msg || "未知状态";
            if (obj.success && obj.data.obtain !== 0) notifyMsg.push(`✅ 累计奖励: ${msg}`);
            else if (!obj.success) notifyMsg.push(`❌ 累计奖励: ${msg}`);
        } catch (e) {}
    }
}

async function loterry_free(ID) {
    const [loginUid, loginSid] = ID.split('@');
    let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/loterry/getLucky?loginUid=${loginUid}&loginSid=${loginSid}&type=free`, headers: kw_headers };
    return $.http.get(options).then((resp) => {
        let obj = JSON.parse(resp.body);
        let msg = obj.data?.loterryname || obj.msg || "未知状态";
        notifyMsg.push(obj.success ? `🎁 免费抽奖: 获得 [${msg}]` : `❌ 免费抽奖: ${msg}`);
    });
}

async function loterry_video(ID) {
    const [loginUid, loginSid] = ID.split('@');
    let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/loterry/getLucky?loginUid=${loginUid}&loginSid=${loginSid}&type=video`, headers: kw_headers };
    return $.http.get(options).then((resp) => {
        let obj = JSON.parse(resp.body);
        let msg = obj.data?.loterryname || obj.msg || "未知状态";
        notifyMsg.push(obj.success ? `🎁 视频抽奖: 获得 [${msg}]` : `❌ 视频抽奖: ${msg}`);
    });
}

// 🛡️ 惊喜任务：恢复原版复杂的随机倒计时和次数限制
let surpriseState = new Map();
function getAccountState(ID) {
    if (!surpriseState.has(ID)) surpriseState.set(ID, { runCount: 0, lastRunTime: 0, lastResetDay: new Date().getDate(), currentMinInterval: 30 });
    return surpriseState.get(ID);
}
function getRandomInterval() { return Math.floor(Math.random() * (60 - 30 + 1)) + 30; }

async function surprise(ID) {
    const now = new Date();
    const today = now.getDate();
    const [loginUid, loginSid] = ID.split('@');
    let state = getAccountState(ID);

    const nowHour = now.getHours();
    if (today !== state.lastResetDay && nowHour >= 0 && nowHour < 7) {
        state.runCount = 0; state.lastRunTime = 0; state.lastResetDay = today; state.currentMinInterval = 30;
    }

    if (state.runCount >= 6) { $.log(`🚫 惊喜任务已达最大次数，防封跳过`); return; }
    const nowTime = now.getTime();
    if (state.lastRunTime && (nowTime - state.lastRunTime) < state.currentMinInterval * 60 * 1000) { $.log(`⏳ 惊喜任务处于冷却中，防封跳过`); return; }
    if (nowHour < 7 || nowHour >= 12) { $.log(`⏰ 当前不在惊喜任务允许时间段，防封跳过`); return; }

    // 结合开卷查询金币功能
    try {
        let list = await $.http.get({ url: `https://integralapi.kuwo.cn/api/v1/online/sign/v1/earningSignIn/newUserSignList?loginUid=${loginUid}&loginSid=${loginSid}`, headers: kw_headers });
        let obj = JSON.parse(list.body);
        let goldNum = obj.data?.dataList?.find(t => t.taskType === "surprise")?.goldNum;
        
        if (goldNum > 0 && goldNum !== "null") {
            let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/v1/earningSignIn/newDoListen?loginUid=${loginUid}&loginSid=${loginSid}&from=surprise&goldNum=${goldNum}&time=&surpriseType=1`, headers: kw_headers };
            const resp = await $.http.get(options);
            let resObj = JSON.parse(resp.body);
            if (resObj.success) {
                notifyMsg.push(`🎁 惊喜任务: 成功 [获得 ${goldNum} 金币]`);
                state.runCount++; state.lastRunTime = nowTime; state.currentMinInterval = getRandomInterval();
                $.setval(JSON.stringify(Array.from(surpriseState.entries())), 'kuwoSurpriseState'); // 缓存状态
            }
        }
    } catch (e) {}
}

async function box(ID) {
    var times = [];
    var hour = new Date().getUTCHours() + 8;
    if (hour >= 0) times.push("00-08");
    if (hour >= 8) times.push("08-10");
    if (hour >= 10) times.push("10-12");
    if (hour >= 12) times.push("12-14");
    if (hour >= 14) times.push("14-16");
    if (hour >= 16) times.push("16-18");
    if (hour >= 18) times.push("18-20");
    if (hour >= 20) times.push("20-24");

    var len = times.length;
    await box_new(ID, times[len - 1]);
    for (var i = 0; i < len - 1; i++) await box_old(ID,times[i]);
}

async function box_new(ID, time) {
    const [loginUid, loginSid] = ID.split('@');
    var rand = Math.random() < 0.3 ? 28 : Math.random() < 0.6 ? 29 : 30;
    let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/new/boxRenew?loginUid=${loginUid}&loginSid=${loginSid}&action=new&time=${time}&goldNum=${rand}`, headers: kw_headers };
    return $.http.get(options).then((resp) => {
        let obj = JSON.parse(resp.body);
        notifyMsg.push(obj.success ? `🎁 定时宝箱: ${obj.data?.description || '成功'}` : `❌ 定时宝箱: ${obj.msg}`);
    });
}

async function box_old(ID, time) {
    const [loginUid, loginSid] = ID.split('@');
    var rand = Math.random() < 0.3 ? 28 : Math.random() < 0.6 ? 29 : 30;
    let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/new/boxRenew?loginUid=${loginUid}&loginSid=${loginSid}&action=old&time=${time}&goldNum=${rand}`, headers: kw_headers };
    return $.http.get(options).then((resp) => {
        let obj = JSON.parse(resp.body);
        notifyMsg.push(obj.success ? `🎁 补领宝箱: ${obj.data?.description || '成功'}` : `❌ 补领宝箱: ${obj.msg}`);
    });
}

async function BoxTask(ID, time) {
    if (!time) {
        const h = (new Date().getUTCHours() + 8) % 24;
        time = h<8?'00-08':h<10?'08-10':h<12?'10-12':h<14?'12-14':h<16?'14-16':h<18?'16-18':h<20?'18-20':'20-24';
    }
    const [loginUid, loginSid] = ID.split('@');
    let listOptions = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/new/newBoxList?loginUid=${loginUid}&loginSid=${loginSid}&from=sign&extraGoldNum=110`, headers: kw_headers };
    
    return $.http.get(listOptions).then((resp) => {
        let data = JSON.parse(resp.body);
        if (data.code === 200 && data.success) {
            let goldNum = data.data.goldNum;
            let finishOptions = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/new/newBoxFinish?loginUid=${loginUid}&loginSid=${loginSid}&action=new&time=${time}&goldNum=${goldNum}&baseTaskGold=0&extraGoldNum=0&clickExtraGoldNum=0&yyzdSecondRewardFlag=0&secondRewardFlag=0&apiv=6`, headers: kw_headers };
            return $.http.get(finishOptions).then((finishResp) => {
                let obj = JSON.parse(finishResp.body);
                notifyMsg.push(obj.success ? `🎁 活动宝箱: 成功 [${goldNum}金币]` : `❌ 活动宝箱: 失败`);
            });
        }
    });
}

async function Clockin(ID) {
    const [loginUid, loginSid] = ID.split('@');
    let options = { url: `https://integralapi.kuwo.cn/api/v1/online/sign/v1/earningSignIn/newDoListen?loginUid=${loginUid}&loginSid=${loginSid}&from=clock&goldNum=59`, headers: kw_headers };
    return $.http.get(options).then((resp) => {
        let obj = JSON.parse(resp.body);
        notifyMsg.push(obj.success ? `✅ 整点打卡: 成功 [59金币]` : `❌ 整点打卡: ${obj.msg}`);
    });
}

// ---------------- 环境构造器 (复用原作者带写入能力的稳健版) ----------------
function Env(name) {
  const fs = require('fs');
  const path = require('path');
  let axios; try { axios = require('axios'); } catch (e) { throw new Error('缺少依赖 axios，请先在青龙安装：axios'); }

  class Http {
    constructor(env) { this.env = env; }
    get(opts) { return this.env._request(opts, 'GET'); }
    post(opts) { return this.env._request(opts, 'POST'); }
  }

  return new (class {
    constructor(name) {
      this.name = name; this.http = new Http(this); this.dataFile = 'box.dat'; this.data = null; this.logs = []; this.startTime = Date.now(); this.log('', `🔔${this.name}, 开始!`);
    }
    isNode() { return true; }
    loaddata() {
      try {
        const file = path.resolve(process.cwd(), this.dataFile);
        return JSON.parse(fs.readFileSync(file, 'utf-8') || '{}');
      } catch (_) { return {}; }
    }
    writedata() {
      try {
        const file = path.resolve(process.cwd(), this.dataFile);
        fs.writeFileSync(file, JSON.stringify(this.data || {}, null, 2));
      } catch (_) {}
    }
    getval(key) { this.data = this.loaddata(); return this.data ? this.data[key] : null; }
    setval(val, key) { this.data = this.loaddata(); this.data[key] = val; this.writedata(); return true; }
    getdata(key) { return this.getval(key) || process.env[key]; }
    setdata(val, key) { return this.setval(val, key); }
    log(...args) { if (!args.length) return; const out = args.join('\n'); console.log(out); this.logs.push(out); }
    logErr(err) { console.log(`\n❗️${this.name} 出错!`, err); }
    wait(ms) { return new Promise(r => setTimeout(r, ms)); }
    done() { console.log(`\n🔔${this.name}, 结束! 🕛 ${((Date.now() - this.startTime) / 1000).toFixed(2)} 秒`); }
    async _request(opts, method = 'GET') {
      const resp = await axios({ method, url: typeof opts === 'string' ? opts : opts.url, headers: opts.headers || {}, data: opts.body || undefined, timeout: opts.timeout || 30000, validateStatus: () => true, responseType: 'text', transformResponse: [(d) => d] });
      return { status: resp.status, statusCode: resp.status, headers: resp.headers || {}, body: resp.data };
    }
    get(opts, cb) { this._request(opts, 'GET').then(r => cb(null, r, r.body)).catch(e => cb(e, null, null)); }
  })(name);
}