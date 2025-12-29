// Boss Decoder 主应用逻辑

// 初始化Supabase客户端（如果已配置）
let supabaseClient = null;
if (CONFIG.APP.ENABLE_SUPABASE && CONFIG.SUPABASE.PROJECT_URL && CONFIG.SUPABASE.PUBLISHABLE_KEY) {
    try {
        supabaseClient = supabase.createClient(
            CONFIG.SUPABASE.PROJECT_URL,
            CONFIG.SUPABASE.PUBLISHABLE_KEY
        );
        console.log('Supabase客户端已初始化');
    } catch (error) {
        console.error('Supabase初始化失败:', error);
    }
}

// DOM元素
const messageInput = document.getElementById('messageInput');
const charCount = document.getElementById('charCount');
const analyzeBtn = document.getElementById('analyzeBtn');
const resultsSection = document.getElementById('resultsSection');
const loadingOverlay = document.getElementById('loadingOverlay');
const toneBadge = document.getElementById('toneBadge');
const angerValue = document.getElementById('angerValue');
const angerFill = document.getElementById('angerFill');
const angerLevel = document.getElementById('angerLevel');
const repliesList = document.getElementById('repliesList');
const historyList = document.getElementById('historyList');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');

// 语气类型定义
const TONE_TYPES = {
    calm: { label: '平静', class: 'calm', color: '#10B981' },
    urgent: { label: '催促', class: 'urgent', color: '#F59E0B' },
    unhappy: { label: '不满', class: 'unhappy', color: '#F97316' },
    angry: { label: '愤怒', class: 'angry', color: '#EF4444' },
    encouraging: { label: '鼓励', class: 'encouraging', color: '#8B5CF6' }
};

// 怒气值等级
function getAngerLevel(value) {
    if (value < 20) return { level: '低', class: 'low' };
    if (value < 50) return { level: '中', class: 'medium' };
    if (value < 80) return { level: '高', class: 'high' };
    return { level: '极高', class: 'critical' };
}

// 字符计数
messageInput.addEventListener('input', () => {
    charCount.textContent = messageInput.value.length;
});

// 分析消息
async function analyzeMessage(text) {
    if (!text.trim()) {
        alert('请输入要分析的消息');
        return;
    }

    // 显示加载状态
    resultsSection.style.display = 'flex';
    loadingOverlay.classList.remove('hidden');
    analyzeBtn.disabled = true;

    try {
        let analysisResult;

        // 如果配置了API，调用真实API
        if (CONFIG.AI_AGENT.API_URL && CONFIG.AI_AGENT.API_KEY) {
            analysisResult = await callAIAgent(text);
        } else {
            // 否则使用模拟数据
            analysisResult = await simulateAnalysis(text);
        }

        // 显示结果
        displayResults(analysisResult);

        // 保存到历史记录
        await saveToHistory(text, analysisResult);

        // 加载历史记录
        loadHistory();

    } catch (error) {
        console.error('分析失败:', error);
        alert('分析失败，请稍后重试');
    } finally {
        loadingOverlay.classList.add('hidden');
        analyzeBtn.disabled = false;
    }
}

// 调用智能体API进行语气和怒气值分析
async function callAIAgent(text) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.AI_AGENT.TIMEOUT);

    try {
        // 第一步：分析语气和怒气值
        const analysisPrompt = `你是一个专业的商务沟通分析专家。请分析以下老板发送的消息，识别语气类型和评估怒气值。

消息内容：
"${text}"

请严格按照以下JSON格式返回分析结果，不要添加任何其他文字：
{
    "tone": "语气类型（必须是以下之一：calm平静、urgent催促、unhappy不满、angry愤怒、encouraging鼓励）",
    "angerValue": 怒气值数字（0-100的整数，0表示完全不生气，100表示极度愤怒）,
    "reason": "简要说明分析理由（一句话）"
}

请仔细分析消息中的：
1. 用词强度（如"立即"、"马上"、"非常"等）
2. 标点符号（感叹号、问号的数量）
3. 表达方式（疑问、命令、批评、鼓励等）
4. 情绪词汇（生气、不满、失望、满意等）

只返回JSON，不要其他内容。`;

        // 尝试不同的认证方式（智谱AI可能使用不同的格式）
        let analysisResponse;
        let analysisData;
        
        // 方式1: Bearer token
        try {
            analysisResponse = await fetch(CONFIG.AI_AGENT.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.AI_AGENT.API_KEY}`
                },
                body: JSON.stringify({
                    model: 'glm-4',
                    messages: [
                        {
                            role: 'user',
                            content: analysisPrompt
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 500
                }),
                signal: controller.signal
            });
        } catch (e) {
            // 如果Bearer方式失败，尝试直接使用API_KEY
            analysisResponse = await fetch(CONFIG.AI_AGENT.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': CONFIG.AI_AGENT.API_KEY
                },
                body: JSON.stringify({
                    model: 'glm-4',
                    messages: [
                        {
                            role: 'user',
                            content: analysisPrompt
                        }
                    ],
                    temperature: 0.3,
                    max_tokens: 500
                }),
                signal: controller.signal
            });
        }

        clearTimeout(timeoutId);

        if (!analysisResponse.ok) {
            const errorText = await analysisResponse.text();
            console.error('API错误响应:', errorText);
            throw new Error(`API请求失败: ${analysisResponse.status} - ${errorText}`);
        }

        analysisData = await analysisResponse.json();
        
        // 处理不同的响应格式
        let analysisContent;
        if (analysisData.choices && analysisData.choices[0] && analysisData.choices[0].message) {
            analysisContent = analysisData.choices[0].message.content.trim();
        } else if (analysisData.content) {
            analysisContent = analysisData.content.trim();
        } else if (typeof analysisData === 'string') {
            analysisContent = analysisData.trim();
        } else {
            throw new Error('无法解析API响应格式');
        }
        
        // 解析JSON响应（可能包含markdown代码块）
        let analysisResult;
        try {
            // 尝试提取JSON（可能在```json代码块中）
            let jsonStr = analysisContent;
            
            // 尝试从markdown代码块中提取
            const codeBlockMatch = analysisContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
                jsonStr = codeBlockMatch[1].trim();
            } else {
                // 尝试直接匹配JSON对象
                const jsonMatch = analysisContent.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    jsonStr = jsonMatch[0];
                }
            }
            
            analysisResult = JSON.parse(jsonStr);
        } catch (e) {
            console.error('解析分析结果失败:', e);
            console.error('原始内容:', analysisContent);
            // 如果解析失败，使用模拟分析作为后备
            return await simulateAnalysis(text);
        }

        // 验证和规范化结果
        const validTones = ['calm', 'urgent', 'unhappy', 'angry', 'encouraging'];
        let tone = analysisResult.tone;
        if (typeof tone === 'string') {
            tone = tone.toLowerCase();
            // 处理中文语气名称
            if (tone.includes('平静') || tone.includes('calm')) tone = 'calm';
            else if (tone.includes('催促') || tone.includes('urgent')) tone = 'urgent';
            else if (tone.includes('不满') || tone.includes('unhappy')) tone = 'unhappy';
            else if (tone.includes('愤怒') || tone.includes('angry')) tone = 'angry';
            else if (tone.includes('鼓励') || tone.includes('encouraging')) tone = 'encouraging';
        }
        tone = validTones.includes(tone) ? tone : 'calm';
        
        // 处理怒气值（可能是字符串或数字）
        let angerValue = analysisResult.angerValue;
        if (typeof angerValue === 'string') {
            // 提取数字
            const numMatch = angerValue.match(/\d+/);
            angerValue = numMatch ? parseInt(numMatch[0]) : 0;
        }
        angerValue = Math.min(100, Math.max(0, parseInt(angerValue) || 0));

        // 第二步：生成智能回复建议
        const replies = await generateAIReplies(text, tone, angerValue);

        return {
            tone,
            angerValue,
            replies,
            reason: analysisResult.reason || ''
        };

    } catch (error) {
        if (error.name === 'AbortError') {
            console.error('API请求超时');
            throw new Error('请求超时，请检查网络连接后重试');
        }
        console.error('API调用失败:', error);
        // 如果API调用失败，使用模拟分析作为后备
        console.warn('使用后备分析方案');
        return await simulateAnalysis(text);
    }
}

// 使用AI生成智能回复建议
async function generateAIReplies(originalText, tone, angerValue) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.AI_AGENT.TIMEOUT);

    try {
        const replyPrompt = `你是一个专业的商务沟通助手。老板发送了以下消息，请生成3条不同策略的回复建议。

老板的消息：
"${originalText}"

分析结果：
- 语气类型：${TONE_TYPES[tone].label}
- 怒气值：${angerValue}%

请生成3条回复建议，每条回复应该：
1. 针对具体的语气和怒气值调整策略
2. 专业、得体、符合商务沟通规范
3. 具体可操作，不要使用占位符（如[时间]、[具体事项]等）
4. 根据怒气值选择合适的回复策略：
   - 怒气值低（0-30）：可以解释说明，提供信息
   - 怒气值中（31-60）：需要认错并说明改进措施
   - 怒气值高（61-100）：需要立即认错并给出具体行动方案

请严格按照以下JSON格式返回，不要添加任何其他文字：
{
    "replies": [
        {
            "type": "回复策略类型（如：解释型、认错型、行动型、感谢型等）",
            "content": "完整的回复内容"
        },
        {
            "type": "回复策略类型",
            "content": "完整的回复内容"
        },
        {
            "type": "回复策略类型",
            "content": "完整的回复内容"
        }
    ]
}

只返回JSON，不要其他内容。`;

        // 尝试不同的认证方式
        let replyResponse;
        let replyData;
        
        try {
            replyResponse = await fetch(CONFIG.AI_AGENT.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.AI_AGENT.API_KEY}`
                },
                body: JSON.stringify({
                    model: 'glm-4',
                    messages: [
                        {
                            role: 'user',
                            content: replyPrompt
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 1500
                }),
                signal: controller.signal
            });
        } catch (e) {
            replyResponse = await fetch(CONFIG.AI_AGENT.API_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': CONFIG.AI_AGENT.API_KEY
                },
                body: JSON.stringify({
                    model: 'glm-4',
                    messages: [
                        {
                            role: 'user',
                            content: replyPrompt
                        }
                    ],
                    temperature: 0.7,
                    max_tokens: 1500
                }),
                signal: controller.signal
            });
        }

        clearTimeout(timeoutId);

        if (!replyResponse.ok) {
            const errorText = await replyResponse.text();
            console.error('回复API错误响应:', errorText);
            throw new Error(`回复生成API请求失败: ${replyResponse.status} - ${errorText}`);
        }

        replyData = await replyResponse.json();
        
        // 处理不同的响应格式
        let replyContent;
        if (replyData.choices && replyData.choices[0] && replyData.choices[0].message) {
            replyContent = replyData.choices[0].message.content.trim();
        } else if (replyData.content) {
            replyContent = replyData.content.trim();
        } else if (typeof replyData === 'string') {
            replyContent = replyData.trim();
        } else {
            throw new Error('无法解析回复API响应格式');
        }

        // 解析JSON响应
        try {
            let jsonStr = replyContent;
            
            // 尝试从markdown代码块中提取
            const codeBlockMatch = replyContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (codeBlockMatch) {
                jsonStr = codeBlockMatch[1].trim();
            } else {
                // 尝试直接匹配JSON对象
                const jsonMatch = replyContent.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    jsonStr = jsonMatch[0];
                }
            }
            
            const replyResult = JSON.parse(jsonStr);
            
            // 验证回复格式
            if (replyResult.replies && Array.isArray(replyResult.replies) && replyResult.replies.length > 0) {
                // 确保每条回复都有type和content
                const validReplies = replyResult.replies
                    .filter(reply => reply.type && reply.content)
                    .slice(0, 3);
                if (validReplies.length > 0) {
                    return validReplies;
                }
            }
        } catch (e) {
            console.error('解析回复结果失败:', e);
            console.error('原始内容:', replyContent);
        }

        // 如果解析失败，使用后备方案
        return generateReplySuggestions(tone, angerValue, originalText);

    } catch (error) {
        if (error.name === 'AbortError') {
            console.warn('回复生成超时，使用后备方案');
        } else {
            console.error('回复生成失败:', error);
        }
        // 使用后备方案
        return generateReplySuggestions(tone, angerValue, originalText);
    }
}

// 模拟分析（用于测试或API调用失败时的后备方案）
async function simulateAnalysis(text) {
    // 模拟API延迟
    await new Promise(resolve => setTimeout(resolve, 800));

    // 改进的文本分析逻辑
    const lowerText = text.toLowerCase();
    
    // 语气识别和怒气值计算
    let tone = 'calm';
    let angerValue = 0;
    let angerFactors = [];

    // 1. 检查催促类词汇
    const urgentWords = ['立即', '马上', '立刻', '赶紧', '尽快', '紧急', '急', '快', 'now', 'asap'];
    const urgentCount = urgentWords.filter(word => lowerText.includes(word)).length;
    if (urgentCount > 0) {
        tone = 'urgent';
        angerValue += urgentCount * 15;
        angerFactors.push(`检测到${urgentCount}个催促词汇`);
    }

    // 2. 检查负面情绪词汇
    const negativeWords = ['不行', '不对', '错了', '问题', '太慢', '太差', '失望', '不满', '糟糕', '差劲'];
    const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
    if (negativeCount > 0) {
        tone = negativeCount > 2 ? 'angry' : 'unhappy';
        angerValue += negativeCount * 20;
        angerFactors.push(`检测到${negativeCount}个负面词汇`);
    }

    // 3. 检查愤怒类词汇
    const angryWords = ['生气', '愤怒', '火大', '气死', '非常', '特别', '极其', '严重'];
    const angryCount = angryWords.filter(word => lowerText.includes(word)).length;
    if (angryCount > 0) {
        tone = 'angry';
        angerValue += angryCount * 25;
        angerFactors.push(`检测到${angryCount}个愤怒词汇`);
    }

    // 4. 检查鼓励类词汇
    const encouragingWords = ['加油', '不错', '很好', '继续', '保持', '优秀', '棒', 'good', 'great'];
    const encouragingCount = encouragingWords.filter(word => lowerText.includes(word)).length;
    if (encouragingCount > 0 && angerValue < 30) {
        tone = 'encouraging';
        angerValue = Math.max(0, angerValue - 10);
        angerFactors.push(`检测到${encouragingCount}个鼓励词汇`);
    }

    // 5. 检查标点符号强度
    const exclamationCount = (text.match(/！|!/g) || []).length;
    const questionCount = (text.match(/？|\?/g) || []).length;
    
    if (exclamationCount > 0) {
        angerValue += exclamationCount * 10;
        if (exclamationCount > 2) {
            tone = 'angry';
        } else if (tone === 'calm') {
            tone = 'urgent';
        }
        angerFactors.push(`${exclamationCount}个感叹号`);
    }
    
    if (questionCount > 2 && tone === 'calm') {
        tone = 'urgent';
        angerValue += 15;
    }

    // 6. 检查文本长度（短文本可能更紧急）
    if (text.length < 20 && (urgentCount > 0 || exclamationCount > 0)) {
        angerValue += 10;
    }

    // 7. 检查大写字母（英文）
    const upperCaseCount = (text.match(/[A-Z]/g) || []).length;
    if (upperCaseCount > text.length * 0.3 && text.length > 10) {
        angerValue += 15;
        if (tone === 'calm') tone = 'urgent';
    }

    // 规范化怒气值
    angerValue = Math.min(100, Math.max(0, angerValue));
    
    // 如果怒气值很低，确保语气是calm或encouraging
    if (angerValue < 20 && tone !== 'encouraging') {
        tone = 'calm';
    }

    // 生成回复建议
    const replies = generateReplySuggestions(tone, angerValue, text);

    return {
        tone,
        angerValue,
        replies,
        reason: angerFactors.length > 0 ? angerFactors.join('；') : '未检测到明显情绪信号'
    };
}

// 生成回复建议
function generateReplySuggestions(tone, angerValue, originalText) {
    const strategies = [];

    // 解释型回复
    if (angerValue > 30) {
        strategies.push({
            type: '解释型',
            content: `收到您的消息。关于您提到的问题，我正在进行中，预计[时间]完成。如有任何疑问，我会及时向您汇报进展。`
        });
    }

    // 认错型回复
    if (angerValue > 50) {
        strategies.push({
            type: '认错型',
            content: `非常抱歉给您带来了不便。我理解您的关切，确实是我在[具体事项]上处理不当。我会立即采取行动，确保问题得到解决。`
        });
    }

    // 行动型回复
    strategies.push({
        type: '行动型',
        content: `明白。我会立即处理，具体措施如下：\n1. [具体行动1]\n2. [具体行动2]\n3. [具体行动3]\n我会在[时间]前完成并向您汇报。`
    });

    // 根据语气调整回复
    if (tone === 'encouraging') {
        strategies[0] = {
            type: '感谢型',
            content: `感谢您的鼓励和支持！我会继续保持，努力完成[具体事项]。如有任何需要调整的地方，请随时告诉我。`
        };
    }

    return strategies;
}

// 显示分析结果
function displayResults(result) {
    // 显示语气
    const toneInfo = TONE_TYPES[result.tone] || TONE_TYPES.calm;
    toneBadge.textContent = toneInfo.label;
    toneBadge.className = `tone-badge ${toneInfo.class}`;

    // 显示怒气值
    const angerLevelInfo = getAngerLevel(result.angerValue);
    angerValue.textContent = result.angerValue;
    angerFill.style.width = `${result.angerValue}%`;
    angerFill.className = `anger-fill ${angerLevelInfo.class}`;
    angerLevel.textContent = `怒气等级: ${angerLevelInfo.level}`;

    // 显示分析理由（如果有）
    const angerReason = document.getElementById('angerReason');
    if (result.reason && angerReason) {
        angerReason.textContent = `分析依据: ${result.reason}`;
        angerReason.style.display = 'block';
    } else if (angerReason) {
        angerReason.style.display = 'none';
    }

    // 显示回复建议
    repliesList.innerHTML = '';
    if (result.replies && result.replies.length > 0) {
        result.replies.forEach((reply, index) => {
            const replyItem = document.createElement('div');
            replyItem.className = 'reply-item';
            replyItem.innerHTML = `
                <div class="reply-header">
                    <span class="reply-strategy">${reply.type}</span>
                    <button class="copy-btn" onclick="copyReply(${index})">
                        <span>📋</span>
                        <span>复制</span>
                    </button>
                </div>
                <div class="reply-content">${reply.content}</div>
            `;
            repliesList.appendChild(replyItem);
        });
    } else {
        // 如果没有回复，生成默认回复
        const defaultReplies = generateReplySuggestions(result.tone, result.angerValue, '');
        defaultReplies.forEach((reply, index) => {
            const replyItem = document.createElement('div');
            replyItem.className = 'reply-item';
            replyItem.innerHTML = `
                <div class="reply-header">
                    <span class="reply-strategy">${reply.type}</span>
                    <button class="copy-btn" onclick="copyReply(${index})">
                        <span>📋</span>
                        <span>复制</span>
                    </button>
                </div>
                <div class="reply-content">${reply.content}</div>
            `;
            repliesList.appendChild(replyItem);
        });
        result.replies = defaultReplies;
    }

    // 存储当前回复内容用于复制
    window.currentReplies = result.replies;
}

// 复制回复
function copyReply(index) {
    if (!window.currentReplies || !window.currentReplies[index]) return;

    const text = window.currentReplies[index].content;
    navigator.clipboard.writeText(text).then(() => {
        const buttons = document.querySelectorAll('.copy-btn');
        if (buttons[index]) {
            const btn = buttons[index];
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<span>✓</span><span>已复制</span>';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.classList.remove('copied');
            }, 2000);
        }
    }).catch(err => {
        console.error('复制失败:', err);
        alert('复制失败，请手动复制');
    });
}

// 保存到历史记录
async function saveToHistory(originalText, analysisResult) {
    const historyItem = {
        id: Date.now(),
        timestamp: new Date().toISOString(),
        text: originalText,
        tone: analysisResult.tone,
        angerValue: analysisResult.angerValue,
        preview: originalText.substring(0, 50) + (originalText.length > 50 ? '...' : '')
    };

    if (supabaseClient) {
        // 保存到Supabase
        try {
            const { error } = await supabaseClient
                .from('analysis_history')
                .insert([historyItem]);
            
            if (error) throw error;
        } catch (error) {
            console.error('Supabase保存失败:', error);
            // 降级到本地存储
            saveToLocalStorage(historyItem);
        }
    } else {
        // 保存到本地存储
        saveToLocalStorage(historyItem);
    }
}

// 保存到本地存储
function saveToLocalStorage(historyItem) {
    let history = JSON.parse(localStorage.getItem('bossDecoderHistory') || '[]');
    history.unshift(historyItem);
    
    // 限制历史记录数量
    if (history.length > CONFIG.APP.MAX_HISTORY) {
        history = history.slice(0, CONFIG.APP.MAX_HISTORY);
    }
    
    localStorage.setItem('bossDecoderHistory', JSON.stringify(history));
}

// 加载历史记录
async function loadHistory() {
    let history = [];

    if (supabaseClient) {
        // 从Supabase加载
        try {
            const { data, error } = await supabaseClient
                .from('analysis_history')
                .select('*')
                .order('timestamp', { ascending: false })
                .limit(CONFIG.APP.MAX_HISTORY);
            
            if (error) throw error;
            history = data || [];
        } catch (error) {
            console.error('Supabase加载失败:', error);
            // 降级到本地存储
            history = JSON.parse(localStorage.getItem('bossDecoderHistory') || '[]');
        }
    } else {
        // 从本地存储加载
        history = JSON.parse(localStorage.getItem('bossDecoderHistory') || '[]');
    }

    displayHistory(history);
}

// 显示历史记录
function displayHistory(history) {
    if (history.length === 0) {
        historyList.innerHTML = `
            <div class="history-empty">
                <p>暂无历史记录</p>
                <span>分析结果将自动保存</span>
            </div>
        `;
        return;
    }

    historyList.innerHTML = history.map(item => {
        const toneInfo = TONE_TYPES[item.tone] || TONE_TYPES.calm;
        const date = new Date(item.timestamp);
        const timeStr = date.toLocaleString('zh-CN', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        return `
            <div class="history-item" onclick="loadHistoryItem('${item.id}')">
                <div class="history-preview">${item.preview}</div>
                <div class="history-meta">
                    <span class="history-tone ${toneInfo.class}">${toneInfo.label}</span>
                    <span>${timeStr}</span>
                </div>
            </div>
        `;
    }).join('');
}

// 加载历史记录项
async function loadHistoryItem(id) {
    let history = [];

    if (supabaseClient) {
        try {
            const { data, error } = await supabaseClient
                .from('analysis_history')
                .select('*')
                .eq('id', id)
                .single();
            
            if (error) throw error;
            if (data) {
                messageInput.value = data.text;
                charCount.textContent = data.text.length;
                await analyzeMessage(data.text);
            }
        } catch (error) {
            console.error('加载历史记录失败:', error);
        }
    } else {
        history = JSON.parse(localStorage.getItem('bossDecoderHistory') || '[]');
        const item = history.find(h => h.id === parseInt(id));
        if (item) {
            messageInput.value = item.text;
            charCount.textContent = item.text.length;
            await analyzeMessage(item.text);
        }
    }
}

// 清空历史记录
async function clearHistory() {
    if (!confirm('确定要清空所有历史记录吗？')) return;

    if (supabaseClient) {
        try {
            const { error } = await supabaseClient
                .from('analysis_history')
                .delete()
                .neq('id', 0); // 删除所有记录
            
            if (error) throw error;
        } catch (error) {
            console.error('清空历史记录失败:', error);
        }
    }

    localStorage.removeItem('bossDecoderHistory');
    loadHistory();
}

// 事件监听
analyzeBtn.addEventListener('click', () => {
    analyzeMessage(messageInput.value);
});

messageInput.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'Enter') {
        analyzeMessage(messageInput.value);
    }
});

clearHistoryBtn.addEventListener('click', clearHistory);

// 页面加载时加载历史记录
document.addEventListener('DOMContentLoaded', () => {
    loadHistory();
});

// 将函数暴露到全局作用域（用于onclick）
window.copyReply = copyReply;
window.loadHistoryItem = loadHistoryItem;

